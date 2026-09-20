import { api } from '../../../shared/api/client'
import { z } from 'zod'
import type { buildCanonicalGrantEnvelope } from '../../../shared/crypto/grant-protocol'
import type { CreateVaultProtocolPayload } from '../../../shared/crypto/create-vault-protocol'
import type { ScriptExecutionEncryptedPackageV1 } from '../../../shared/crypto/script-execution'
import type { CanonicalEntryEnvelopes } from '../../../shared/crypto/entry-protocol'
import {
  agentDiscoveryEnvelopeSchema,
  memberIndexEnvelopeSchema,
  memberSecretEnvelopeSchema,
  vaultEntryKeyEnvelopeSchema,
} from '../sync/entry-envelope-schema'
import { canonicalU64Schema, canonicalUuidSchema, u32Schema } from '../sync/vault-key-material-schema'
import { normalizeEntryType } from '../types'
import type {
  EntryContent,
  EntryDetail,
  EntryListItem,
  GrantMode,
  UpdateVaultInput,
  Vault,
  VaultSummary,
} from '../types'

export interface VaultListResponse {
  vaults: VaultSummary[]
}

export interface VaultCreationChallengeResponse {
  vaultId: string
  expiresAt: string
}

export type CreateVaultPayload = CreateVaultProtocolPayload

export function getVaults(): Promise<VaultListResponse> {
  return api.get('api/vaults').json<VaultListResponse>()
}

export function getVault(id: string): Promise<Vault> {
  return api.get(`api/vaults/${id}`).json<Vault>()
}

export function issueVaultCreationChallenge(): Promise<VaultCreationChallengeResponse> {
  return api.post('api/vaults/creation-challenges').json<VaultCreationChallengeResponse>()
}

export async function createVault(payload: CreateVaultPayload): Promise<void> {
  await api.post('api/vaults', { json: payload })
}

/**
 * PATCH-style update — only fields present in `payload` are changed.
 * Backend returns 204 No Content on success, so we resolve to void.
 */
export async function updateVault(
  id: string,
  payload: UpdateVaultInput,
): Promise<void> {
  await api.put(`api/vaults/${id}`, { json: payload })
}

export async function deleteVault(id: string): Promise<void> {
  await api.delete(`api/vaults/${id}`)
}

/**
 * Cursor-paginated entries listing. The list intentionally omits the
 * encrypted blob and nonce — those are fetched lazily on reveal via
 * {@link getEntry} to keep the payload small and reduce the surface
 * where secret bytes are present in browser memory.
 */
export interface EntryListResponse {
  items: EntryListItem[]
  nextCursor?: string
}

export async function getEntries(
  vaultId: string,
  cursor?: string,
): Promise<EntryListResponse> {
  const response = await api
    .get(`api/vaults/${vaultId}/entries`, {
      searchParams: cursor ? { cursor } : undefined,
    })
    .json<EntryListResponse>()
  // The backend serialises `type` as a string ("key"/"credential"); normalise
  // it to the numeric EntryType every consumer compares against.
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      type: normalizeEntryType(item.type),
    })),
  }
}

/**
 * Fetch EVERY entry of a vault by following the cursor to the last page. Use
 * this when the caller needs the complete set — bulk export and import
 * conflict-detection — rather than {@link getEntries}, which returns only the
 * first page and would silently miss entries in vaults larger than one page.
 */
export async function getAllEntries(vaultId: string): Promise<EntryListItem[]> {
  const all: EntryListItem[] = []
  let cursor: string | undefined
  do {
    const page = await getEntries(vaultId, cursor)
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

export async function getEntry(
  vaultId: string,
  entryId: string,
): Promise<EntryDetail> {
  const entry = await api
    .get(`api/vaults/${vaultId}/entries/${entryId}`)
    .json<EntryDetail>()
  return { ...entry, type: normalizeEntryType(entry.type) }
}

const canonicalEntryDetailSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  id: canonicalUuidSchema,
  state: z.union([z.string(), z.number().int()]),
  currentRevision: canonicalU64Schema,
  memberIndexRevision: canonicalU64Schema,
  agentDiscoveryRevision: canonicalU64Schema.nullable(),
  agentDiscoveryRevisionHighWatermark: canonicalU64Schema,
  currentKeyVersion: u32Schema,
  deliveryPolicy: z.enum(['standard', 'execOnly', 'injectOnly']),
  createdAt: z.string(),
  createdBy: canonicalUuidSchema,
  updatedAt: z.string(),
  updatedBy: canonicalUuidSchema,
  memberIndex: memberIndexEnvelopeSchema,
  memberSecret: memberSecretEnvelopeSchema,
  agentDiscovery: agentDiscoveryEnvelopeSchema.nullable(),
  entryKey: vaultEntryKeyEnvelopeSchema,
}).superRefine((entry, context) => {
  const envelopes = [entry.memberIndex, entry.memberSecret, entry.entryKey, entry.agentDiscovery].filter(Boolean)
  if (envelopes.some((envelope) => envelope!.descriptor.scope.organizationId !== entry.organizationId
    || envelope!.descriptor.scope.vaultId !== entry.vaultId || envelope!.descriptor.scope.entryId !== entry.id)) {
    context.addIssue({ code: 'custom', message: 'Entry envelope scope mismatch' })
  }
  if (entry.currentRevision !== entry.memberSecret.descriptor.resourceRevision
    || entry.memberIndexRevision !== entry.memberIndex.descriptor.resourceRevision
    || entry.currentKeyVersion !== entry.entryKey.descriptor.keyVersion
    || entry.agentDiscoveryRevision !== (entry.agentDiscovery?.descriptor.resourceRevision ?? null)) {
    context.addIssue({ code: 'custom', message: 'Entry projection head mismatch' })
  }
})

export type CanonicalEntryDetail = z.infer<typeof canonicalEntryDetailSchema>
export type CanonicalGrantEnvelope = Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>
export interface EntryUpdateMaterial {
  baseRevision: string
  newEntryKey?: CanonicalEntryEnvelopes['entryKey']
  memberSecret: CanonicalEntryEnvelopes['memberSecret']
  memberIndex?: CanonicalEntryEnvelopes['memberIndex']
  agentDiscoveryChanged: boolean
  agentDiscovery?: NonNullable<CanonicalEntryEnvelopes['agentDiscovery']>
  deliveryPolicy: 'standard' | 'execOnly' | 'injectOnly'
  grantEnvelopes: CanonicalGrantEnvelope[]
  scriptGrantPackages?: ScriptExecutionEncryptedPackageV1[]
}
export interface EntryLifecycleMaterial {
  baseRevision: string
  newEntryKey?: CanonicalEntryEnvelopes['entryKey']
  memberSecret: CanonicalEntryEnvelopes['memberSecret']
  memberIndex?: CanonicalEntryEnvelopes['memberIndex']
  agentDiscovery?: NonNullable<CanonicalEntryEnvelopes['agentDiscovery']>
}

const restoreEntryResponseSchema = z.object({
  state: z.union([z.string(), z.number().int()]),
  currentRevision: canonicalU64Schema,
})

const recentlyDeletedEntrySchema = z.object({
  id: canonicalUuidSchema,
  state: z.union([z.string(), z.number().int()]),
  currentRevision: canonicalU64Schema,
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string(),
  retentionExpiresAt: z.string(),
  memberIndex: memberIndexEnvelopeSchema,
}).superRefine((item, context) => {
  if (item.memberIndex.descriptor.scope.entryId !== item.id) {
    context.addIssue({ code: 'custom', message: 'Recently Deleted Entry scope mismatch' })
  }
})

const recentlyDeletedResponseSchema = z.object({
  items: z.array(recentlyDeletedEntrySchema),
  nextCursor: z.string().nullable(),
})

export type RecentlyDeletedEntry = z.infer<typeof recentlyDeletedEntrySchema>
export type RecentlyDeletedResponse = z.infer<typeof recentlyDeletedResponseSchema>

function normalizeHistoryActor(actor: string | number): string | number {
  if (actor === 'member') return 1
  if (actor === 'agent') return 2
  if (actor === 'system') return 3
  return actor
}

const entryHistoryItemSchema = z.object({
  revision: canonicalU64Schema,
  memberSequence: canonicalU64Schema,
  discoverySequence: canonicalU64Schema.nullable(),
  operation: z.enum(['created', 'updated', 'archived', 'restored', 'deleted']).transform((operation) =>
    ({ created: 1, updated: 2, archived: 3, restored: 4, deleted: 5 } as const)[operation]),
  keyVersion: u32Schema,
  entryKey: vaultEntryKeyEnvelopeSchema,
  memberSecret: memberSecretEnvelopeSchema,
}).superRefine((item, context) => {
  if (item.revision !== item.memberSecret.descriptor.resourceRevision
    || item.operation !== item.memberSecret.descriptor.binding.operation
    || item.keyVersion !== item.entryKey.descriptor.keyVersion
    || item.keyVersion !== item.memberSecret.descriptor.keyVersion) {
    context.addIssue({ code: 'custom', message: 'Entry history envelope head mismatch' })
  }
  if (item.entryKey.descriptor.scope.organizationId !== item.memberSecret.descriptor.scope.organizationId
    || item.entryKey.descriptor.scope.vaultId !== item.memberSecret.descriptor.scope.vaultId
    || item.entryKey.descriptor.scope.entryId !== item.memberSecret.descriptor.scope.entryId) {
    context.addIssue({ code: 'custom', message: 'Entry history envelope scope mismatch' })
  }
})

const entryHistoryResponseSchema = z.object({
  currentRevision: canonicalU64Schema,
  items: z.array(entryHistoryItemSchema).max(20),
  nextBeforeRevision: canonicalU64Schema.nullable(),
})

export interface EntryHistoryItem extends z.infer<typeof entryHistoryItemSchema> {
  changedAt: string
  changedByType: string | number
  changedById: string
}
export interface EntryHistoryResponse extends z.infer<typeof entryHistoryResponseSchema> {
  items: EntryHistoryItem[]
  policy: { maximumVersions: number; maximumAgeDays: number }
}

export async function getEntryHistory(
  vaultId: string,
  entryId: string,
  beforeRevision?: string,
  signal?: AbortSignal,
): Promise<EntryHistoryResponse> {
  const raw = await api.get(`api/vaults/${vaultId}/entries/${entryId}/history`, {
    searchParams: { pageSize: '20', ...(beforeRevision ? { beforeRevision } : {}) },
    signal,
  }).json<EntryHistoryResponse>()
  const page = entryHistoryResponseSchema.parse(raw)
  if (page.items.some((item) => item.entryKey.descriptor.scope.vaultId !== vaultId
    || item.entryKey.descriptor.scope.entryId !== entryId)) {
    throw new Error('Entry history response scope mismatch')
  }
  return { ...page, policy: raw.policy, items: page.items.map((item, index) => ({
    ...item,
    changedAt: raw.items[index].changedAt,
    changedByType: normalizeHistoryActor(raw.items[index].changedByType),
    changedById: raw.items[index].changedById,
  })) }
}

export async function getCanonicalEntry(
  vaultId: string,
  entryId: string,
  signal?: AbortSignal,
): Promise<CanonicalEntryDetail> {
  const raw = await api.get(`api/vaults/${vaultId}/entries/${entryId}`, { signal }).json()
  return canonicalEntryDetailSchema.parse(raw)
}

export async function updateCanonicalEntry(
  vaultId: string,
  entryId: string,
  material: EntryUpdateMaterial,
): Promise<{ currentRevision: string }> {
  return api.put(`api/vaults/${vaultId}/entries/${entryId}`, { json: material })
    .json<{ currentRevision: string }>()
}

export interface ScriptAccessImpact {
  effectiveAgentCount: number
  directAgentCount: number
  fullAgentCount: number
  hasOverlappingCoverage: boolean
  agentIds: string[]
}

export function getScriptAccessImpact(vaultId: string, scriptEntryId: string): Promise<ScriptAccessImpact> {
  return api.get(`api/vaults/${vaultId}/scripts/${scriptEntryId}/access-impact`)
    .json<ScriptAccessImpact>()
}

export async function restoreCanonicalEntry(
  vaultId: string,
  entryId: string,
  material: EntryLifecycleMaterial,
): Promise<{ state: string | number; currentRevision: string }> {
  const raw = await api.post(`api/vaults/${vaultId}/entries/${entryId}/restore`, { json: material }).json()
  return restoreEntryResponseSchema.parse(raw)
}

export async function getRecentlyDeletedEntries(
  vaultId: string,
  cursor?: string,
): Promise<RecentlyDeletedResponse> {
  const raw = await api.get(`api/vaults/${vaultId}/entries/recently-deleted`, {
    searchParams: { pageSize: '100', ...(cursor ? { cursor } : {}) },
  }).json()
  const page = recentlyDeletedResponseSchema.parse(raw)
  if (page.items.some((item) => item.memberIndex.descriptor.scope.vaultId !== vaultId)) {
    throw new Error('Recently Deleted response scope mismatch')
  }
  return page
}

/** Irreversible, server-transactional purge. Missing Entries are a successful no-op. */
export async function destroyCanonicalEntry(vaultId: string, entryId: string): Promise<void> {
  await api.post(`api/vaults/${vaultId}/entries/${entryId}/destroy`)
}

export function createEntry(
  vaultId: string,
  payload: { entryId: string; deliveryPolicy: 'standard' | 'execOnly' | 'injectOnly' } & CanonicalEntryEnvelopes,
  signal?: AbortSignal,
): Promise<{ id: string; currentRevision: string }> {
  return api
    .post(`api/vaults/${vaultId}/entries`, { json: payload, signal, retry: 0 })
    .json<{ id: string; currentRevision: string }>()
}

export async function issueEntryCreationChallenges(
  vaultId: string,
  count: number,
  signal?: AbortSignal,
): Promise<{ entryId: string; expiresAt: string }[]> {
  const response = await api.post(`api/vaults/${vaultId}/entries/creation-challenges`, {
    json: { vaultId, count }, signal, retry: 0,
  }).json<{ items: { entryId: string; expiresAt: string }[] }>()
  if (response.items.length !== count) throw new Error('Entry creation challenge count mismatch')
  return response.items
}

export async function issueEntryCreationChallenge(vaultId: string, signal?: AbortSignal): Promise<{ entryId: string; expiresAt: string }> {
  const [challenge] = await issueEntryCreationChallenges(vaultId, 1, signal)
  if (!challenge) throw new Error('Entry creation challenge response was empty')
  return challenge
}

export async function updateEntry(
  vaultId: string,
  entryId: string,
  payload: {
    label?: string
    description?: string
    icon?: string
    color?: string
    urlDomain?: string
    content?: EntryContent
    agentFields?: { label: string; value: string }[]
  },
): Promise<void> {
  await api.put(`api/vaults/${vaultId}/entries/${entryId}`, { json: payload })
}

export async function deleteEntry(
  vaultId: string,
  entryId: string,
): Promise<void> {
  await api.delete(`api/vaults/${vaultId}/entries/${entryId}`)
}

/**
 * One encrypted Entry in a bulk import request. FULL access no longer adds any
 * per-Entry fan-out; the non-secret delivery policy lets the backend enforce
 * Script/CreditCard method restrictions before returning ciphertext.
 */
export interface ImportEntryItem {
  entryId: string
  entryKey: CanonicalEntryEnvelopes['entryKey']
  memberIndex: CanonicalEntryEnvelopes['memberIndex']
  memberSecret: CanonicalEntryEnvelopes['memberSecret']
  agentDiscovery?: CanonicalEntryEnvelopes['agentDiscovery']
  deliveryPolicy: 'standard' | 'execOnly' | 'injectOnly'
}

export interface ImportEntriesBody {
  format: string
  entries: ImportEntryItem[]
}

export interface ImportEntriesResponse {
  importedCount: number
  entryIds: string[]
}

/**
 * Bulk-create encrypted entries. The backend caps a single request at 500
 * items; callers chunk larger imports and sum the responses.
 *
 * A 2xx response with an empty body is treated as success (imported count =
 * items sent). This guards the "data saved but the wizard shows an error" case:
 * `.json()` throws on an empty body, which would fire the mutation's `onError`
 * even though every entry was persisted.
 */
export async function importEntries(
  vaultId: string,
  body: ImportEntriesBody,
): Promise<ImportEntriesResponse> {
  const response = await api.post(`api/vaults/${vaultId}/entries/import`, {
    json: body,
  })
  const text = await response.text()
  if (!text.trim()) return { importedCount: body.entries.length, entryIds: body.entries.map((entry) => entry.entryId) }
  return JSON.parse(text) as ImportEntriesResponse
}

/**
 * Record that a plaintext export happened. Fire-and-forget from the UI — a
 * failed audit write must never block the user's download.
 */
export async function exportAudit(
  vaultId: string,
  body: { format: string; entryCount: number },
): Promise<void> {
  await api.post(`api/vaults/${vaultId}/export-audit`, { json: body })
}

// Re-export for convenient consumption by hooks/tests.
export type { GrantMode }
