import { useMutation, useQueryClient } from '@tanstack/react-query'
import { encryptEntry } from '../../shared/crypto/entry-crypto'
import { wipe } from '../../shared/crypto/sodium'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { useAuthStore } from '../auth'
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
  /** Progress callback — invoked after each entry is encrypted + sent. */
  onProgress?: (done: number, total: number) => void
}

export interface ImportEntriesResult {
  importedCount: number
  updatedCount: number
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
 * FULL-grant re-wrap mirrors the create-entry flow: neither wraps newly-added
 * entries for existing FULL grants today (tracked by CVT-140), so `grantEntries`
 * is empty. When create-entry gains that behaviour, apply it here identically.
 */
export function useImportEntries() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ImportEntriesInput): Promise<ImportEntriesResult> => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!input.wrappedVK) throw new MissingWrappedVaultKeyError()

      const total = input.creates.length + input.overwrites.length
      let done = 0
      const bump = () => {
        done += 1
        input.onProgress?.(done, total)
      }

      const vaultKey = await unsealVaultKey(input.wrappedVK, privateKey)
      try {
        const items: ImportEntryItem[] = []
        for (const entry of input.creates) {
          const content = await encryptEntry(toPlaintext(entry), vaultKey)
          items.push({
            label: entry.label,
            type: entry.type,
            content,
            urlDomain: extractDomain(entry.url),
            grantEntries: [],
          })
          bump()
        }

        let importedCount = 0
        for (let i = 0; i < items.length; i += IMPORT_CHUNK_SIZE) {
          const chunk = items.slice(i, i + IMPORT_CHUNK_SIZE)
          const response = await importEntries(input.vaultId, {
            format: input.format,
            entries: chunk,
          })
          importedCount += response.importedCount
        }

        let updatedCount = 0
        for (const { entryId, entry } of input.overwrites) {
          const content = await encryptEntry(toPlaintext(entry), vaultKey)
          await updateEntry(input.vaultId, entryId, {
            label: entry.label,
            urlDomain: extractDomain(entry.url),
            content,
          })
          updatedCount += 1
          bump()
        }

        return { importedCount, updatedCount }
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: (_result, variables) => {
      // Same invalidations as a single create — entries list, vault detail +
      // summary counts, and the cross-vault recent/search surfaces.
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['entries', 'recent'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}
