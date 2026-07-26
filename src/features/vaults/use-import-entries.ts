import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import {
  buildEntryProjections,
  createEntryUpdateMaterial,
  createInitialEntryMaterial,
  decryptMemberSecret,
  defaultAgentVisibilityPolicy,
  type CanonicalEntryDraft,
} from '../../shared/crypto/vault-v2-entry'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { openDiscoveryKey } from '../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import {
  collectActiveFullGrants,
  getOrgGrants,
  GRANT_STATUS_ACTIVE,
  GRANT_TYPE_FULL,
  type OrgGrant,
} from '../grants'
import { grantMethodsMask, parseGrantMethods } from '../grants/grant-methods'
import type { ParsedEntry } from './import'
import {
  importEntries,
  getCanonicalEntry,
  issueEntryCreationChallenges,
  updateCanonicalEntry,
  type ImportEntryItem,
} from './api/vault-api'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryPlaintext,
} from './types'
import { VaultLockedError } from './use-create-entry'
import { getEncryptedVault } from './sync/member-sync-api'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

/** Import batch size — well under the backend cap (500) so the progress bar ticks
 * every ~50 entries instead of freezing on one huge POST. */
const IMPORT_CHUNK_SIZE = 50

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

/** An existing entry to overwrite with freshly-parsed content. */
export interface ImportOverwrite {
  entryId: string
  entry: ParsedEntry
}

export interface ImportEntriesInput {
  vaultId: string
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
  // External importers only ever produce KEY or CREDENTIAL entries.
  return {
    type: ENTRY_TYPE_CREDENTIAL,
    username: entry.username ?? '',
    password: entry.password ?? '',
    url: entry.url,
    notes: entry.notes,
    totp: entry.totp,
  }
}

function toDraft(entry: ParsedEntry): CanonicalEntryDraft {
  const content = toPlaintext(entry)
  return {
    memberLabel: entry.label,
    agentLabel: entry.label,
    entryType: entry.type,
    content,
    policy: defaultAgentVisibilityPolicy(entry.type, content.fields ?? []),
  }
}

async function activeCoveringGrants(vaultId: string, entryId: string): Promise<OrgGrant[]> {
  const grants: OrgGrant[] = []
  let cursor: string | undefined
  do {
    const page = await getOrgGrants({ vaultId, status: GRANT_STATUS_ACTIVE, cursor, pageSize: 100 })
    grants.push(...page.items.filter((grant) => grant.type === GRANT_TYPE_FULL || grant.entryId === entryId))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return grants
}

/**
 * Bulk-import parsed entries into a vault. Each bounded chunk receives opaque
 * server-issued IDs, becomes a complete protocol-2 projection set locally, and
 * is committed atomically. Exact retry reuses the same IDs/ciphertext. Existing
 * Entries use the normal optimistic revision path and refresh every covering
 * grant. VK/VDK material is opened once and wiped regardless of outcome.
 */
export function useImportEntries() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ImportEntriesInput): Promise<ImportEntriesResult> => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      const total = input.creates.length + input.overwrites.length

      // Fetch active FULL grants once before opening keys. An empty list is valid.
      let fullGrants
      try {
        fullGrants = await collectActiveFullGrants(input.vaultId)
      } catch (error) {
        throw new ImportStepError('grants', error)
      }
      const vault = await getEncryptedVault(input.vaultId)
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
        organizationId: vault.memberVaultKey.organizationId,
        vaultId: vault.id,
        memberId: vault.memberVaultKey.memberId,
        vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, privateKey)
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openDiscoveryKey(vault.discoveryKey, vaultKey)
        const labelsByEntryId = new Map<string, string>()
        let importedCount = 0
        const failed: { label: string; reason: string }[] = []

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
              failed.push({ label: labelsByEntryId.get(chunk[0].entryId) ?? '', reason: await readErrorReason(error) })
              input.onProgress?.(importedCount + failed.length, total, 'save')
              return
            }
            const mid = Math.ceil(chunk.length / 2)
            await saveChunk(chunk.slice(0, mid))
            await saveChunk(chunk.slice(mid))
          }
        }

        let encryptedCount = 0
        for (let offset = 0; offset < input.creates.length; offset += IMPORT_CHUNK_SIZE) {
          const sourceChunk = input.creates.slice(offset, offset + IMPORT_CHUNK_SIZE)
          const challenges = await issueEntryCreationChallenges(input.vaultId, sourceChunk.length)
          const encryptedChunk: ImportEntryItem[] = []
          try {
            for (let index = 0; index < sourceChunk.length; index += 1) {
              if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
              const entry = sourceChunk[index]
              const entryId = challenges[index]?.entryId
              if (!entryId) throw new Error('Entry creation challenge count mismatch')
              const draft = toDraft(entry)
              const material = await createInitialEntryMaterial(draft, {
                organizationId: vault.memberVaultKey.organizationId,
                vaultId: vault.id,
                entryId,
                vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
                vdkVersion: vault.currentKeyEpoch.vdkVersion,
                memberKeyGeneration: vault.memberKeyGeneration,
              }, vaultKey, discoveryKey)
              const memberSecret = buildEntryProjections(draft).memberSecret
              const grantEnvelopes = []
              for (const grant of fullGrants) {
                const methods = parseGrantMethods(grant.methods)
                if (methods.length === 0) throw new Error('Active FULL grant method context is invalid')
                grantEnvelopes.push(await produceGrantEntryEnvelope({
                  memberSecret,
                  agentPublicKey: grant.agentPublicKey,
                  scope: {
                    organizationId: vault.memberVaultKey.organizationId,
                    vaultId: vault.id,
                    grantId: grant.grantId,
                    agentId: grant.agentId,
                    entryId,
                    entryRevision: '1',
                    grantEnvelopeRevision: '1',
                    grantKeyVersion: 1,
                    memberKeyGeneration: vault.memberKeyGeneration,
                    recipientAgentKeyVersion: grant.recipientAgentKeyVersion,
                    approvedMethods: grantMethodsMask(methods),
                    ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
                    ...(grant.remainingUses !== undefined ? { remainingUses: grant.remainingUses } : {}),
                  },
                }))
              }
              encryptedChunk.push({ entryId, ...material, grantEnvelopes })
              labelsByEntryId.set(entryId, entry.label)
              input.onProgress?.(++encryptedCount, input.creates.length, 'encrypt')
            }
          } catch (error) {
            throw new ImportStepError('encrypt', error)
          }
          await saveChunk(encryptedChunk)
        }

        let updatedCount = 0
        for (const { entryId, entry } of input.overwrites) {
          try {
            if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
            const [detail, grants] = await Promise.all([
              getCanonicalEntry(input.vaultId, entryId),
              activeCoveringGrants(input.vaultId, entryId),
            ])
            const previous = await decryptMemberSecret(detail, vaultKey)
            const draft = toDraft(entry)
            const material = await createEntryUpdateMaterial(
              detail, previous, draft, vaultKey, vault.currentKeyEpoch.vdkVersion, discoveryKey,
            )
            const nextSecret = buildEntryProjections(draft).memberSecret
            for (const grant of grants) {
              const scope = grant.entryScopes.find((candidate) => candidate.entryId === entryId)
              const methods = parseGrantMethods(grant.methods)
              if (!scope?.grantEnvelopeRevision || !scope.grantKeyVersion || !scope.fieldIds.length
                || !grant.agentId || !grant.agentPublicKey || !grant.recipientAgentKeyVersion
                || methods.length === 0) throw new Error('Active grant refresh context is invalid')
              material.grantEnvelopes.push(await produceGrantEntryEnvelope({
                memberSecret: nextSecret,
                agentPublicKey: grant.agentPublicKey,
                fieldIds: scope.fieldIds,
                narrowToPolicy: true,
                scope: {
                  organizationId: detail.organizationId,
                  vaultId: input.vaultId,
                  grantId: grant.id,
                  agentId: grant.agentId,
                  entryId,
                  entryRevision: material.memberSecret.revision,
                  grantEnvelopeRevision: (BigInt(scope.grantEnvelopeRevision) + 1n).toString(),
                  grantKeyVersion: scope.grantKeyVersion + 1,
                  memberKeyGeneration: vault.memberKeyGeneration,
                  recipientAgentKeyVersion: grant.recipientAgentKeyVersion,
                  approvedMethods: grantMethodsMask(methods),
                  ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
                  ...(grant.queryLimit !== null && grant.queryLimit !== undefined
                    ? { remainingUses: grant.queryLimit - (grant.queryCount ?? 0) }
                    : {}),
                },
              }))
            }
            await updateCanonicalEntry(input.vaultId, entryId, material)
            updatedCount += 1
          } catch (error) {
            failed.push({ label: entry.label ?? '', reason: await readErrorReason(error) })
          }
          input.onProgress?.(importedCount + updatedCount + failed.length, total, 'save')
        }

        return { importedCount, updatedCount, failed }
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: (_result, variables) => {
      // Same server-state invalidations as a single create. Local recents and
      // search update through the synchronized MemberIndex store.
      // Prefix match — also covers the entries/all + entry-detail sub-keys.
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
    },
  })
}
