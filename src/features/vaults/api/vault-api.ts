import { api } from '../../../shared/api/client'
import { z } from 'zod'
import type { GrantEntryEnvelope } from '../../../shared/crypto/grant-envelope'
import type { InitialVaultMaterial } from '../../../shared/crypto/vault-v2-creation'
import type { InitialEntryMaterial } from '../../../shared/crypto/vault-v2-entry'
import type { CanonicalEntryDetail, EntryLifecycleMaterial, EntryUpdateMaterial } from '../../../shared/crypto/vault-v2-entry'
import { memberIndexEnvelopeSchema, vaultEntryKeyEnvelopeSchema } from '../sync/entry-envelope-schema'
import { canonicalU64Schema, canonicalUuidSchema, u32Schema, vaultEnvelopeHeaderSchema } from '../sync/vault-key-material-schema'
import { normalizeEntryType } from '../types'
import type {
  EntryContent,
  EntryDetail,
  EntryListItem,
  EntryType,
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

export type CreateVaultPayload = InitialVaultMaterial

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

export const memberSecretEnvelopeSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  entryId: canonicalUuidSchema,
  revision: canonicalU64Schema,
  operation: z.union([
    z.enum(['created', 'updated', 'archived', 'restored', 'deleted']),
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]).transform((operation) => typeof operation === 'number'
    ? operation
    : ({ created: 1, updated: 2, archived: 3, restored: 4, deleted: 5 } as const)[operation]),
  header: vaultEnvelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

const agentDiscoveryEnvelopeSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  entryId: canonicalUuidSchema,
  agentDiscoveryRevision: canonicalU64Schema,
  vdkVersion: u32Schema,
  header: vaultEnvelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

const canonicalEntryDetailSchema = z.object({
  organizationId: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  id: canonicalUuidSchema,
  state: z.union([z.enum(['active', 'archived', 'deleted']), z.literal(1), z.literal(2), z.literal(3)]),
  currentRevision: canonicalU64Schema,
  memberIndexRevision: canonicalU64Schema,
  agentDiscoveryRevision: canonicalU64Schema.nullable(),
  agentDiscoveryRevisionHighWatermark: canonicalU64Schema,
  currentKeyVersion: u32Schema,
  createdAt: z.string(),
  createdBy: canonicalUuidSchema,
  updatedAt: z.string(),
  updatedBy: canonicalUuidSchema,
  memberIndex: memberIndexEnvelopeSchema,
  memberSecret: memberSecretEnvelopeSchema,
  agentDiscovery: agentDiscoveryEnvelopeSchema.nullable(),
  entryKey: vaultEntryKeyEnvelopeSchema,
}).strict().superRefine((entry, context) => {
  const envelopes = [entry.memberIndex, entry.memberSecret, entry.entryKey, entry.agentDiscovery].filter(Boolean)
  if (envelopes.some((envelope) => envelope!.organizationId !== entry.organizationId
    || envelope!.vaultId !== entry.vaultId || envelope!.entryId !== entry.id)) {
    context.addIssue({ code: 'custom', message: 'Entry envelope scope mismatch' })
  }
  if (entry.currentRevision !== entry.memberSecret.revision
    || entry.memberIndexRevision !== entry.memberIndex.memberIndexRevision
    || entry.currentKeyVersion !== entry.entryKey.keyVersion
    || entry.agentDiscoveryRevision !== (entry.agentDiscovery?.agentDiscoveryRevision ?? null)) {
    context.addIssue({ code: 'custom', message: 'Entry projection head mismatch' })
  }
  if (entry.agentDiscoveryRevision !== null
    && BigInt(entry.agentDiscoveryRevision) > BigInt(entry.agentDiscoveryRevisionHighWatermark)) {
    context.addIssue({ code: 'custom', message: 'Entry Discovery watermark mismatch' })
  }
})

const restoreEntryResponseSchema = z.object({
  state: z.union([z.literal('active'), z.literal(1)]),
  currentRevision: canonicalU64Schema,
}).strict()

const recentlyDeletedEntrySchema = z.object({
  id: canonicalUuidSchema,
  state: z.union([z.literal('deleted'), z.literal(3)]),
  currentRevision: canonicalU64Schema,
  updatedAt: z.string().datetime({ offset: true }),
  archivedAt: z.string().datetime({ offset: true }).nullable(),
  deletedAt: z.string().datetime({ offset: true }),
  retentionExpiresAt: z.string().datetime({ offset: true }),
  memberIndex: memberIndexEnvelopeSchema,
}).strict().superRefine((item, context) => {
  if (item.memberIndex.entryId !== item.id) {
    context.addIssue({ code: 'custom', message: 'Recently Deleted Entry scope mismatch' })
  }
})

const recentlyDeletedResponseSchema = z.object({
  items: z.array(recentlyDeletedEntrySchema),
  nextCursor: z.string().nullable(),
}).strict()

export type RecentlyDeletedEntry = z.infer<typeof recentlyDeletedEntrySchema>
export type RecentlyDeletedResponse = z.infer<typeof recentlyDeletedResponseSchema>

const actorTypeSchema = z.union([
  z.enum(['member', 'agent', 'system']), z.literal(1), z.literal(2), z.literal(3),
]).transform((actor) => typeof actor === 'number'
  ? actor
  : ({ member: 1, agent: 2, system: 3 } as const)[actor])

const entryHistoryItemSchema = z.object({
  revision: canonicalU64Schema,
  memberSequence: canonicalU64Schema,
  discoverySequence: canonicalU64Schema.nullable(),
  changedAt: z.string(),
  changedByType: actorTypeSchema,
  changedById: canonicalUuidSchema,
  operation: memberSecretEnvelopeSchema.shape.operation,
  keyVersion: u32Schema,
  entryKey: vaultEntryKeyEnvelopeSchema,
  memberSecret: memberSecretEnvelopeSchema,
}).strict().superRefine((item, context) => {
  if (item.revision !== item.memberSecret.revision
    || item.operation !== item.memberSecret.operation
    || item.keyVersion !== item.entryKey.keyVersion
    || item.keyVersion !== item.memberSecret.header.keyVersion) {
    context.addIssue({ code: 'custom', message: 'Entry history envelope head mismatch' })
  }
  if (item.entryKey.organizationId !== item.memberSecret.organizationId
    || item.entryKey.vaultId !== item.memberSecret.vaultId
    || item.entryKey.entryId !== item.memberSecret.entryId) {
    context.addIssue({ code: 'custom', message: 'Entry history envelope scope mismatch' })
  }
})

const entryHistoryResponseSchema = z.object({
  currentRevision: canonicalU64Schema,
  items: z.array(entryHistoryItemSchema),
  nextBeforeRevision: canonicalU64Schema.nullable(),
  policy: z.object({ maximumVersions: z.number().int().positive(), maximumAgeDays: z.number().int().positive() }).strict(),
}).strict()

export type EntryHistoryItem = z.infer<typeof entryHistoryItemSchema>
export type EntryHistoryResponse = z.infer<typeof entryHistoryResponseSchema>

export async function getEntryHistory(
  vaultId: string,
  entryId: string,
  beforeRevision?: string,
): Promise<EntryHistoryResponse> {
  const raw = await api.get(`api/vaults/${vaultId}/entries/${entryId}/history`, {
    searchParams: { pageSize: '20', ...(beforeRevision ? { beforeRevision } : {}) },
  }).json()
  const page = entryHistoryResponseSchema.parse(raw)
  if (page.items.some((item) => item.entryKey.vaultId !== vaultId || item.entryKey.entryId !== entryId)) {
    throw new Error('Entry history response scope mismatch')
  }
  return page
}

export async function getCanonicalEntry(vaultId: string, entryId: string): Promise<CanonicalEntryDetail> {
  const raw = await api.get(`api/vaults/${vaultId}/entries/${entryId}`).json()
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

export async function restoreCanonicalEntry(
  vaultId: string,
  entryId: string,
  material: EntryLifecycleMaterial,
): Promise<{ state: 'active' | 1; currentRevision: string }> {
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
  if (page.items.some((item) => item.memberIndex.vaultId !== vaultId)) {
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
  payload: { entryId: string; grantEnvelopes: unknown[] } & InitialEntryMaterial,
): Promise<{ id: string; currentRevision: string }> {
  return api
    .post(`api/vaults/${vaultId}/entries`, { json: payload })
    .json<{ id: string; currentRevision: string }>()
}

export async function issueEntryCreationChallenge(vaultId: string): Promise<{ entryId: string; expiresAt: string }> {
  const response = await api.post(`api/vaults/${vaultId}/entries/creation-challenges`, {
    json: { vaultId, count: 1 },
  }).json<{ items: { entryId: string; expiresAt: string }[] }>()
  const challenge = response.items[0]
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
 * One entry in a bulk import request — a single create-entry payload plus the
 * `grantEntries` re-wrap material. The backend requires exactly one entry here
 * per ACTIVE FULL grant on the vault (empty when none): each carries the new
 * entry's plaintext re-encrypted under a fresh DEK sealed to that grant's agent,
 * keyed by `grantId`. The client encrypts against the vault key before building
 * this.
 */
export interface ImportEntryItem {
  label: string
  description?: string
  icon?: string
  type: EntryType
  content: EntryContent
  urlDomain?: string
  grantEntries: ({ grantId: string } & GrantEntryEnvelope)[]
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
  if (!text.trim()) {
    return { importedCount: body.entries.length, entryIds: [] }
  }
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
