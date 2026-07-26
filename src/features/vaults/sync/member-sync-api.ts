import { z } from 'zod'
import { api } from '../../../shared/api/client'

const canonicalUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
const canonicalU64 = z.string().regex(/^(0|[1-9][0-9]{0,19})$/).refine((value) => BigInt(value) <= 0xffffffffffffffffn)
const u32 = z.number().int().min(0).max(0xffffffff)
const MAXIMUM_SYNC_RESPONSE_BYTES = 4 * 1024 * 1024
const syncCursor = z.string().max(2_048)

const envelopeHeaderSchema = z.object({
  protocolVersion: z.literal(2),
  algorithmSuite: z.literal(1),
  resourceKind: z.number().int().min(0).max(0xffff),
  projectionKind: z.number().int().min(0).max(0xffff),
  resourceRevision: canonicalU64,
  keyVersion: u32,
  memberKeyGeneration: u32,
  nonce: z.string(),
}).strict()

export const memberIndexEnvelopeSchema = z.object({
  organizationId: canonicalUuid,
  vaultId: canonicalUuid,
  entryId: canonicalUuid,
  memberIndexRevision: canonicalU64,
  header: envelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

export const vaultEntryKeyEnvelopeSchema = z.object({
  organizationId: canonicalUuid,
  vaultId: canonicalUuid,
  entryId: canonicalUuid,
  wrapperRevision: canonicalU64,
  keyVersion: u32,
  memberKeyGeneration: u32,
  wrappingKeyVersion: u32,
  header: envelopeHeaderSchema,
  wrappedEntryDekByVk: z.string(),
}).strict().superRefine((entryKey, context) => {
  if (entryKey.wrapperRevision !== entryKey.header.resourceRevision
    || entryKey.keyVersion !== entryKey.header.keyVersion
    || entryKey.memberKeyGeneration !== entryKey.header.memberKeyGeneration) {
    context.addIssue({ code: 'custom', message: 'Entry key envelope binding mismatch' })
  }
})

const memberVaultMetadataEnvelopeSchema = z.object({
  organizationId: canonicalUuid,
  vaultId: canonicalUuid,
  metadataRevision: canonicalU64,
  header: envelopeHeaderSchema,
  ciphertext: z.string(),
}).strict()

const memberVaultKeyEnvelopeSchema = z.object({
  protocolVersion: z.literal(2),
  algorithmSuite: z.literal(1),
  organizationId: canonicalUuid,
  vaultId: canonicalUuid,
  memberId: canonicalUuid,
  vkVersion: u32,
  memberKeyGeneration: u32,
  recipientMemberKeyVersion: u32,
  recipientMemberKeyFingerprint: z.string(),
  sealedVaultKeyPackage: z.string(),
}).strict()

const vaultKeyEpochSchema = z.object({
  vaultKeyVersion: u32,
  vdkVersion: u32,
  agentMessageKeyVersion: u32,
  manifestSigningKeyVersion: u32,
}).strict()

export const encryptedVaultSummarySchema = z.object({
  id: canonicalUuid,
  isDefault: z.boolean(),
  protocolVersion: z.literal(2),
  memberSequence: canonicalU64,
  discoverySequence: canonicalU64,
  memberKeyGeneration: u32,
  currentKeyEpoch: vaultKeyEpochSchema,
  memberVaultMetadata: memberVaultMetadataEnvelopeSchema,
  memberVaultKey: memberVaultKeyEnvelopeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  activeGrantCount: z.number().int().nonnegative(),
}).strict().superRefine((vault, context) => {
  if (vault.id !== vault.memberVaultMetadata.vaultId || vault.id !== vault.memberVaultKey.vaultId) {
    context.addIssue({ code: 'custom', message: 'Vault envelope scope mismatch' })
  }
  if (vault.memberVaultMetadata.organizationId !== vault.memberVaultKey.organizationId) {
    context.addIssue({ code: 'custom', message: 'Vault organization scope mismatch' })
  }
  if (vault.memberKeyGeneration !== vault.memberVaultKey.memberKeyGeneration) {
    context.addIssue({ code: 'custom', message: 'Vault member generation mismatch' })
  }
  if (vault.currentKeyEpoch.vaultKeyVersion !== vault.memberVaultKey.vkVersion) {
    context.addIssue({ code: 'custom', message: 'Vault key version mismatch' })
  }
})

const entryStateSchema = z.union([
  z.enum(['active', 'archived', 'deleted']),
  z.literal(0), z.literal(1), z.literal(2),
]).transform((state) => typeof state === 'number' ? (['active', 'archived', 'deleted'] as const)[state] : state)

const headSchema = z.object({
  entryId: canonicalUuid,
  kind: z.literal('head'),
  state: entryStateSchema,
  currentRevision: canonicalU64,
  memberIndexRevision: canonicalU64,
  currentKeyVersion: u32,
  entryKey: vaultEntryKeyEnvelopeSchema,
  memberIndex: memberIndexEnvelopeSchema,
}).strict().superRefine((item, context) => {
  if (item.entryId !== item.memberIndex.entryId
    || item.entryId !== item.entryKey.entryId
    || item.memberIndexRevision !== item.memberIndex.memberIndexRevision
    || item.currentKeyVersion !== item.entryKey.keyVersion
    || item.memberIndex.header.keyVersion !== item.currentKeyVersion
    || item.memberIndex.header.memberKeyGeneration !== item.entryKey.memberKeyGeneration) {
    context.addIssue({ code: 'custom', message: 'Member sync head binding mismatch' })
  }
})

const tombstoneSchema = z.object({
  entryId: canonicalUuid,
  kind: z.literal('tombstone'),
  state: z.null(),
  currentRevision: z.null(),
  memberIndexRevision: z.null(),
  currentKeyVersion: z.null(),
  entryKey: z.null(),
  memberIndex: z.null(),
}).strict()

export const memberSyncItemSchema = z.discriminatedUnion('kind', [headSchema, tombstoneSchema])

const listVaultsSchema = z.object({
  vaults: z.array(encryptedVaultSummarySchema).max(200),
  total: z.number().int().nonnegative(),
}).strict()

const snapshotSchema = z.object({
  snapshotBaseSequence: canonicalU64,
  items: z.array(memberSyncItemSchema).max(200),
  nextCursor: syncCursor.nullable(),
}).strict()

const deltaSchema = z.object({
  deltaUpperBound: canonicalU64,
  appliedThroughSequence: canonicalU64,
  items: z.array(memberSyncItemSchema).max(200),
  continuationCursor: syncCursor.nullable(),
}).strict()

const resetSchema = z.object({
  outcome: z.literal('resetRequired'),
  currentSequence: canonicalU64,
  minRetainedSequence: canonicalU64,
  newSnapshotRequired: z.literal(true),
}).strict()

export type EncryptedVaultSummary = z.infer<typeof encryptedVaultSummarySchema>
export type MemberIndexEnvelope = z.infer<typeof memberIndexEnvelopeSchema>
export type VaultEntryKeyEnvelope = z.infer<typeof vaultEntryKeyEnvelopeSchema>
export type MemberSyncItem = z.infer<typeof memberSyncItemSchema>
export type MemberSnapshotPage = z.infer<typeof snapshotSchema>
export type MemberDeltaPage = z.infer<typeof deltaSchema>

const syncHeaders = {
  'X-Palladin-Vault-Protocol': '2',
  'X-Palladin-Sync-Policy': '1',
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const bytes = Number(declaredLength)
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAXIMUM_SYNC_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error('Vault sync response exceeds hard byte limit')
    }
  }
  if (!response.body) throw new Error('Vault sync response has no body')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAXIMUM_SYNC_RESPONSE_BYTES) throw new Error('Vault sync response exceeds hard byte limit')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) throw new Error(`Vault sync request failed with status ${response.status}`)
  return schema.parse(await readBoundedJson(response))
}

export class MemberSyncResetRequiredError extends Error {
  readonly reset: z.infer<typeof resetSchema>

  constructor(reset: z.infer<typeof resetSchema>) {
    super('Vault member sync requires a fresh snapshot')
    this.reset = reset
  }
}

export async function listEncryptedVaults(signal?: AbortSignal): Promise<EncryptedVaultSummary[]> {
  const vaults: EncryptedVaultSummary[] = []
  let offset = 0
  let total: number | undefined
  do {
    const response = await api.get('api/vaults', { searchParams: { limit: 200, offset }, signal })
    const page = listVaultsSchema.parse(await readBoundedJson(response))
    vaults.push(...page.vaults)
    offset += page.vaults.length
    total = page.total
    if (page.vaults.length === 0 && offset < total) throw new Error('Vault list pagination made no progress')
  } while (offset < total)
  return vaults
}

export async function getMemberSnapshotPage(
  vaultId: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<MemberSnapshotPage> {
  const response = await api.post(`api/vaults/${vaultId}/sync/snapshot`, {
    headers: syncHeaders,
    json: { vaultId, cursor, pageSize: 100 },
    signal,
    throwHttpErrors: false,
  })
  return parseResponse(response, snapshotSchema)
}

export async function getMemberDeltaPage(
  vaultId: string,
  afterSequence: string | null,
  continuationCursor: string | null,
  signal?: AbortSignal,
): Promise<MemberDeltaPage> {
  const response = await api.post(`api/vaults/${vaultId}/sync/delta`, {
    headers: syncHeaders,
    json: continuationCursor ? { vaultId, continuationCursor, pageSize: 100 } : { vaultId, afterSequence, pageSize: 100 },
    signal,
    throwHttpErrors: false,
  })
  if (response.status === 409) throw new MemberSyncResetRequiredError(resetSchema.parse(await readBoundedJson(response)))
  return parseResponse(response, deltaSchema)
}
