import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { openMemberSecret, sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import { defaultAgentVisibilityPolicy, toMemberSecret, type EntryDraft } from '../../shared/crypto/entry-draft'
import { buildCanonicalGrantEnvelope, grantMethodsForSecret, listGrantableFields } from '../../shared/crypto/grant-protocol'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { projectAgentDiscovery, publicAssetIconReference } from '../../shared/crypto/vault-plaintext'
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
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  type EntryPlaintext,
} from './types'
import { VaultLockedError } from './use-create-entry'
import { getEncryptedVault } from './sync/member-sync-api'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'
import {
  ensureWebsiteIconsWithin,
  normalizePublicHostname,
  type PublicAsset,
} from '../../shared/api/public-assets-api'
import { extractDomain } from './components/entry-presentation'

/** Keep crypto/save memory bounded independently from catalog request paging. */
const IMPORT_CHUNK_SIZE = 50
const IMPORT_ICON_WAIT_MS = 15_000

/** Which phase of the import failed — surfaced so a failure is attributable. */
export type ImportStep = 'grants' | 'loadVault' | 'openVaultKey' | 'challenge' | 'encrypt' | 'save' | 'overwrite'

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

export type ImportPhase = 'encrypt' | 'save' | 'icons'

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
  if (entry.type === ENTRY_TYPE_CREDIT_CARD) return {
    type: ENTRY_TYPE_CREDIT_CARD,
    cardholderName: entry.cardholderName ?? '', cardNumber: entry.cardNumber ?? '',
    expiryMonth: entry.expiryMonth ?? '', expiryYear: entry.expiryYear ?? '',
    securityCode: entry.securityCode ?? '', pin: entry.pin,
    billingAddress: entry.billingAddress, notes: entry.notes,
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

function toDraft(entry: ParsedEntry, publicAsset?: PublicAsset): EntryDraft {
  const content = toPlaintext(entry)
  return {
    memberLabel: entry.label,
    agentLabel: entry.label,
    entryType: entry.type,
    content,
    policy: defaultAgentVisibilityPolicy(entry.type, content.fields ?? []),
    ...(publicAsset ? { iconReference: publicAssetIconReference({
      assetId: publicAsset.id,
      revision: publicAsset.revision,
      url: publicAsset.url,
    }) } : {}),
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
      let vault: Awaited<ReturnType<typeof getEncryptedVault>>
      try {
        vault = await getEncryptedVault(input.vaultId)
      } catch (error) {
        throw new ImportStepError('loadVault', error)
      }

      // Catalog preparation is public, optional work. Finish it before
      // opening VK/VDK so locking the vault during the bounded wait cannot
      // leave derived key buffers alive until the catalog deadline.
      const iconHostnames = [...new Set([...input.creates, ...input.overwrites.map(({ entry }) => entry)]
        .map((entry) => normalizePublicHostname(extractDomain(entry.url) ?? ''))
        .filter((hostname): hostname is string => hostname !== null))]
      const iconTotal = iconHostnames.length
      if (iconTotal > 0) input.onProgress?.(0, iconTotal, 'icons')
      const publicAssets = iconHostnames.length > 0
        ? await ensureWebsiteIconsWithin(
          iconHostnames,
          IMPORT_ICON_WAIT_MS,
          (ready, count) => input.onProgress?.(ready, count, 'icons'),
        )
        : new Map<string, PublicAsset>()
      if (iconTotal > 0) input.onProgress?.(iconTotal, iconTotal, 'icons')
      if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()

      let vaultKey: Uint8Array
      try {
        vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      } catch (error) {
        throw new ImportStepError('openVaultKey', error)
      }
      const organizationId = vault.memberVaultKey.wrappedVaultKey.descriptor.scope.organizationId
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
        const labelsByEntryId = new Map<string, string>()
        let importedCount = 0
        const failed: { label: string; reason: string }[] = []

        // A batch is atomic on the server — one bad row 400s the whole chunk. Bisect a
        // failed chunk so every valid entry still lands and only the offenders are
        // reported back, with the server's validation message attached.
        const saveChunk = async (chunk: ImportEntryItem[]): Promise<void> => {
          try {
            if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
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
          let challenges: Awaited<ReturnType<typeof issueEntryCreationChallenges>>
          try {
            challenges = await issueEntryCreationChallenges(input.vaultId, sourceChunk.length)
          } catch (error) {
            throw new ImportStepError('challenge', error)
          }
          const encryptedChunk: ImportEntryItem[] = []
          try {
            for (let index = 0; index < sourceChunk.length; index += 1) {
              if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
              const entry = sourceChunk[index]
              const entryId = challenges[index]?.entryId
              if (!entryId) throw new Error('Entry creation challenge count mismatch')
              const hostname = normalizePublicHostname(extractDomain(entry.url) ?? '')
              const draft = toDraft(entry, hostname ? publicAssets.get(hostname) : undefined)
              const memberSecret = toMemberSecret({
                label: draft.memberLabel, agentLabel: draft.agentLabel,
                type: draft.entryType, payload: draft.content, policy: draft.policy,
                iconReference: draft.iconReference,
                vaultId: vault.id,
              })
              const material = await sealCanonicalEntry({
                organizationId,
                vaultId: vault.id,
                entryId,
                revision: '1',
                vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
                vdkVersion: vault.currentKeyEpoch.vdkVersion,
                memberKeyGeneration: vault.memberKeyGeneration,
              }, memberSecret, vaultKey, discoveryKey, 1)
              const grantEnvelopes = []
              for (const grant of fullGrants) {
                const methods = parseGrantMethods(grant.methods)
                if (methods.length === 0) throw new Error('Active FULL grant method context is invalid')
                grantEnvelopes.push(await buildCanonicalGrantEnvelope({
                  secret: memberSecret,
                  agentPublicKey: grant.agentPublicKey,
                  approvedFieldIds: listGrantableFields(memberSecret).map((field) => field.id),
                  organizationId, vaultId: vault.id, grantId: grant.grantId,
                  agentId: grant.agentId, entryId, entryRevision: '1',
                  grantEnvelopeRevision: '1', grantKeyVersion: 1,
                  memberKeyGeneration: vault.memberKeyGeneration,
                  recipientKeyVersion: grant.recipientAgentKeyVersion,
                  approvedMethods: grantMethodsForSecret(memberSecret, grantMethodsMask(methods)),
                  ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
                  ...(grant.remainingUses !== undefined ? { remainingUses: grant.remainingUses } : {}),
                }))
              }
              encryptedChunk.push({ entryId, entryType: draft.entryType, ...material, grantEnvelopes })
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
            const previous = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
              organizationId: detail.organizationId, vaultId: detail.vaultId,
              entryId: detail.id, revision: detail.currentRevision,
            })
            const hostname = normalizePublicHostname(extractDomain(entry.url) ?? '')
            const draft = toDraft(entry, hostname ? publicAssets.get(hostname) : undefined)
            const nextSecret = toMemberSecret({
              label: draft.memberLabel, agentLabel: draft.agentLabel,
              type: draft.entryType, payload: draft.content, policy: draft.policy,
              iconReference: draft.iconReference,
              vaultId: input.vaultId,
            })
            const nextRevision = (BigInt(detail.currentRevision) + 1n).toString()
            const agentDiscoveryChanged = JSON.stringify(projectAgentDiscovery(previous))
              !== JSON.stringify(projectAgentDiscovery(nextSecret))
            const envelopes = await sealCanonicalEntry({
              organizationId: detail.organizationId, vaultId: detail.vaultId, entryId,
              revision: nextRevision,
              entryKeyRevision: (BigInt(detail.entryKey.descriptor.resourceRevision) + 1n).toString(),
              entryKeyVersion: detail.currentKeyVersion + 1,
              memberIndexRevision: (BigInt(detail.memberIndexRevision) + 1n).toString(),
              agentDiscoveryRevision: (BigInt(detail.agentDiscoveryRevisionHighWatermark) + 1n).toString(),
              vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
              vdkVersion: vault.currentKeyEpoch.vdkVersion,
              memberKeyGeneration: vault.memberKeyGeneration,
            }, nextSecret, vaultKey, discoveryKey, 2)
            const material = {
              baseRevision: detail.currentRevision,
              newEntryKey: envelopes.entryKey,
              memberSecret: envelopes.memberSecret,
              memberIndex: envelopes.memberIndex,
              agentDiscoveryChanged,
              ...(agentDiscoveryChanged && envelopes.agentDiscovery ? { agentDiscovery: envelopes.agentDiscovery } : {}),
              grantEnvelopes: [] as Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>[],
            }
            for (const grant of grants) {
              const scope = grant.entryScopes.find((candidate) => candidate.entryId === entryId)
              const methods = parseGrantMethods(grant.methods)
              if (!scope?.grantEnvelopeRevision || !scope.grantKeyVersion || !scope.fieldIds.length
                || !grant.agentId || !grant.agentPublicKey || !grant.recipientAgentKeyVersion
                || methods.length === 0) throw new Error('Active grant refresh context is invalid')
              const grantable = new Set(listGrantableFields(nextSecret).map((field) => field.id))
              const approvedFieldIds = scope.fieldIds.filter((fieldId) => grantable.has(fieldId))
              if (approvedFieldIds.length === 0) throw new Error('Active grant has no permitted fields')
              material.grantEnvelopes.push(await buildCanonicalGrantEnvelope({
                secret: nextSecret,
                agentPublicKey: grant.agentPublicKey,
                approvedFieldIds,
                organizationId: detail.organizationId, vaultId: input.vaultId,
                grantId: grant.id, agentId: grant.agentId, entryId,
                entryRevision: nextRevision,
                grantEnvelopeRevision: (BigInt(scope.grantEnvelopeRevision) + 1n).toString(),
                grantKeyVersion: scope.grantKeyVersion + 1,
                memberKeyGeneration: vault.memberKeyGeneration,
                recipientKeyVersion: grant.recipientAgentKeyVersion,
                approvedMethods: grantMethodsForSecret(nextSecret, grantMethodsMask(methods)),
                ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
                ...(grant.queryLimit !== null && grant.queryLimit !== undefined
                  ? { remainingUses: grant.queryLimit - (grant.queryCount ?? 0) }
                  : {}),
              }))
            }
            if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
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
      useMemberSyncStore.getState().retry()

    },
  })
}
