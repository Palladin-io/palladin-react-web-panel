import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { encryptEntry } from '../../shared/crypto/entry-crypto'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import { wipe } from '../../shared/crypto/sodium'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { useAuthStore } from '../auth'
import { collectActiveFullGrants } from '../grants'
import type { ParsedEntry } from './import'
import {
  importEntries,
  updateEntry,
  type ImportEntryItem,
} from './api/vault-api'
import { extractDomain } from './components/entry-presentation'
import {
  ENTRY_TYPE_KEY,
  type EntryPlaintext,
} from './types'
import { MissingWrappedVaultKeyError, VaultLockedError } from './use-create-entry'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

/** Backend cap on entries per import request — larger imports are chunked. */
const IMPORT_CHUNK_SIZE = 500

/** Which phase of the import failed — surfaced so a failure is attributable. */
export type ImportStep = 'grants' | 'encrypt' | 'save' | 'overwrite'

/**
 * Wraps the underlying error with the phase it happened in, so the UI can show a
 * distinguishable message and analytics records which step broke. The message
 * carries only the step name — never entry contents or key material.
 */
export class ImportStepError extends Error {
  readonly step: ImportStep

  constructor(step: ImportStep, cause: unknown) {
    super(`Import failed during: ${step}`, { cause })
    this.name = 'ImportStepError'
    this.step = step
  }
}

// Backend field limits — enforced client-side so one over-long value can't fail
// the whole atomic batch with a 400.
const MAX_LABEL_LENGTH = 200
const MAX_URL_DOMAIN_LENGTH = 255

function cap(value: string, max: number): string
function cap(value: string | undefined, max: number): string | undefined
function cap(value: string | undefined, max: number): string | undefined {
  if (value == null) return undefined
  return value.length > max ? value.slice(0, max) : value
}

/** An existing entry to overwrite with freshly-parsed content. */
export interface ImportOverwrite {
  entryId: string
  entry: ParsedEntry
}

export interface ImportEntriesInput {
  vaultId: string
  /** Caller's wrapped VK (base64) — from `GET /vaults/{id}`. */
  wrappedVK: string
  /** Source format id, recorded on the server-side import audit. */
  format: string
  /** New entries to create. */
  creates: ParsedEntry[]
  /** Existing entries to replace (conflict strategy = overwrite). */
  overwrites: ImportOverwrite[]
  /** Progress callback — `phase` distinguishes local encryption from server saves. */
  onProgress?: (done: number, total: number, phase: ImportPhase) => void
}

export interface ImportEntriesResult {
  importedCount: number
  updatedCount: number
  /** Entries the server rejected — imported around via bisection, never silently dropped. */
  failed: { label: string; reason: string }[]
}

export type ImportPhase = 'encrypt' | 'save'

/** Human-readable reason from a ky HTTPError (FastEndpoints problem details), or a generic fallback. */
async function readErrorReason(error: unknown): Promise<string> {
  if (error instanceof HTTPError) {
    try {
      const body = (await error.response.clone().json()) as {
        message?: string
        errors?: Record<string, string[]>
      }
      const details = Object.entries(body.errors ?? {})
        .map(([field, messages]) => `${field}: ${messages.join('; ')}`)
        .join(' | ')
      return details || body.message || error.message
    } catch {
      return error.message
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/** Map a parsed entry to the plaintext payload that gets encrypted under VK. */
function toPlaintext(entry: ParsedEntry): EntryPlaintext {
  if (entry.type === ENTRY_TYPE_KEY) {
    return { type: ENTRY_TYPE_KEY, value: entry.value ?? '', notes: entry.notes }
  }
  return {
    type: entry.type,
    username: entry.username ?? '',
    password: entry.password ?? '',
    url: entry.url,
    notes: entry.notes,
    totp: entry.totp,
  }
}

/**
 * Bulk-import parsed entries into a vault. The Vault Key is unsealed once, every
 * entry is encrypted against it in a loop, creates are chunked to the backend
 * cap, and overwrites go out as individual PUTs. The VK is wiped in `finally`
 * regardless of outcome.
 *
 * FULL-grant re-wrap: the backend requires each created entry to carry re-wrap
 * material for every ACTIVE FULL grant on the vault. We fetch those grants once,
 * then for each new entry produce a fresh DEK-sealed envelope per grant (keyed
 * by `grantId`). Overwrites go through the existing entry-update endpoint, which
 * re-wraps server-side. Same crypto as the single-grant flow — delegated to
 * `shared/crypto/grant-envelope`.
 */
export function useImportEntries() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ImportEntriesInput): Promise<ImportEntriesResult> => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!input.wrappedVK) throw new MissingWrappedVaultKeyError()

      const total = input.creates.length + input.overwrites.length

      // Fetch the vault's active FULL grants ONCE — every new entry must be
      // re-wrapped for each of them (empty list = no grants, still valid).
      let fullGrants
      try {
        fullGrants = await collectActiveFullGrants(input.vaultId)
      } catch (error) {
        throw new ImportStepError('grants', error)
      }

      const vaultKey = await unsealVaultKey(input.wrappedVK, privateKey)
      try {
        let items: ImportEntryItem[]
        try {
          items = []
          for (const entry of input.creates) {
            const content = await encryptEntry(toPlaintext(entry), vaultKey)
            const grantEntries = []
            for (const grant of fullGrants) {
              const envelope = await produceGrantEntryEnvelope({
                entryContent: content,
                vaultKey,
                agentPublicKey: grant.agentPublicKey,
              })
              grantEntries.push({ grantId: grant.grantId, ...envelope })
            }
            items.push({
              label: cap(entry.label, MAX_LABEL_LENGTH),
              type: entry.type,
              content,
              urlDomain: cap(extractDomain(entry.url), MAX_URL_DOMAIN_LENGTH),
              grantEntries,
            })
            input.onProgress?.(items.length, input.creates.length, 'encrypt')
          }
        } catch (error) {
          throw new ImportStepError('encrypt', error)
        }

        let importedCount = 0
        const failed: { label: string; reason: string }[] = []
        input.onProgress?.(0, total, 'save')

        // A batch is atomic on the server — one bad row 400s the whole chunk. Bisect a
        // failed chunk so every valid entry still lands and only the offenders are
        // reported back, with the server's validation message attached.
        const saveChunk = async (chunk: ImportEntryItem[]): Promise<void> => {
          try {
            const response = await importEntries(input.vaultId, {
              format: input.format,
              entries: chunk,
            })
            importedCount += response.importedCount
            input.onProgress?.(importedCount + failed.length, total, 'save')
          } catch (error) {
            if (chunk.length === 1) {
              failed.push({ label: chunk[0].label ?? '', reason: await readErrorReason(error) })
              input.onProgress?.(importedCount + failed.length, total, 'save')
              return
            }
            const mid = Math.ceil(chunk.length / 2)
            await saveChunk(chunk.slice(0, mid))
            await saveChunk(chunk.slice(mid))
          }
        }

        for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) {
          await saveChunk(items.slice(i, i + IMPORT_CHUNK_SIZE))
        }

        let updatedCount = 0
        for (const { entryId, entry } of input.overwrites) {
          try {
            const content = await encryptEntry(toPlaintext(entry), vaultKey)
            await updateEntry(input.vaultId, entryId, {
              label: cap(entry.label, MAX_LABEL_LENGTH),
              urlDomain: cap(extractDomain(entry.url), MAX_URL_DOMAIN_LENGTH),
              content,
            })
            updatedCount += 1
          } catch (error) {
            failed.push({ label: entry.label ?? '', reason: await readErrorReason(error) })
          }
          input.onProgress?.(importedCount + updatedCount + failed.length, total, 'save')
        }

        return { importedCount, updatedCount, failed }
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: (_result, variables) => {
      // Same invalidations as a single create — entries list, vault detail +
      // summary counts, and the cross-vault recent/search surfaces.
      // Prefix match — also covers the entries/all + entry-detail sub-keys.
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['entries', 'recent'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
