import { z } from 'zod'
import { api } from '../../../shared/api/client'
import {
  canonicalU64Schema as canonicalU64,
  canonicalUuidSchema as canonicalUuid,
  memberVaultKeyEnvelopeSchema,
  memberVaultMetadataEnvelopeSchema,
  u32Schema as u32,
  vaultDiscoveryKeyEnvelopeSchema,
  vaultPrivateKeyEnvelopeSchema,
} from './vault-key-material-schema'
import { memberIndexEnvelopeSchema, vaultEntryKeyEnvelopeSchema } from './entry-envelope-schema'
export { memberIndexEnvelopeSchema, vaultEntryKeyEnvelopeSchema } from './entry-envelope-schema'

const MAXIMUM_SYNC_RESPONSE_BYTES = 4 * 1024 * 1024
const syncCursor = z.string().max(2_048)

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
  discoveryKey: vaultDiscoveryKeyEnvelopeSchema,
  vaultPrivateKeys: z.array(vaultPrivateKeyEnvelopeSchema).length(2),
  createdAt: z.string(),
  updatedAt: z.string(),
  memberCount: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  activeGrantCount: z.number().int().nonnegative(),
}).strict().superRefine((vault, context) => {
  const metadata = vault.memberVaultMetadata.descriptor
  const memberKey = vault.memberVaultKey.wrappedVaultKey.descriptor
  if (vault.id !== metadata.scope.vaultId || vault.id !== memberKey.scope.vaultId) {
    context.addIssue({ code: 'custom', message: 'Vault envelope scope mismatch' })
  }
  if (metadata.scope.organizationId !== memberKey.scope.organizationId) {
    context.addIssue({ code: 'custom', message: 'Vault organization scope mismatch' })
  }
  if (vault.memberKeyGeneration !== memberKey.memberKeyGeneration) {
    context.addIssue({ code: 'custom', message: 'Vault member generation mismatch' })
  }
  if (vault.currentKeyEpoch.vaultKeyVersion !== memberKey.wrappedKeyVersion) {
    context.addIssue({ code: 'custom', message: 'Vault key version mismatch' })
  }
})

const vaultPublicKeySchema = z.object({
  protocolVersion: z.literal(2),
  schemeId: z.enum(['palladin-x25519-v1', 'palladin-ed25519-v1']),
  keyKind: z.union([
    z.literal('agentMessageX25519').transform(() => 1 as const),
    z.literal('manifestSigningEd25519').transform(() => 2 as const),
    z.literal(1),
    z.literal(2),
  ]),
  keyVersion: u32,
  encodedPublicKey: z.string().min(1),
  fingerprint: z.string().min(1),
}).strict().superRefine((key, context) => {
  if ((key.keyKind === 1 && key.schemeId !== 'palladin-x25519-v1')
    || (key.keyKind === 2 && key.schemeId !== 'palladin-ed25519-v1')) {
    context.addIssue({ code: 'custom', message: 'Vault public key kind does not match its scheme' })
  }
})

// GET /api/vaults/{id} returns the same encrypted projection as the list plus
// public verification/routing material. Keep both wire contracts strict: using
// the list schema for the detail endpoint previously rejected every valid 200.
export const encryptedVaultDetailSchema = encryptedVaultSummarySchema.safeExtend({
  organizationId: canonicalUuid,
  metadataRevision: canonicalU64,
  vaultAgentMessagePublicKey: vaultPublicKeySchema,
  vaultManifestSigningPublicKey: vaultPublicKeySchema,
}).superRefine((vault, context) => {
  if (vault.metadataRevision !== vault.memberVaultMetadata.descriptor.resourceRevision) {
    context.addIssue({ code: 'custom', message: 'Vault metadata revision mismatch' })
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
  updatedAt: z.string().datetime({ offset: true }),
  currentRevision: canonicalU64,
  memberIndexRevision: canonicalU64,
  currentKeyVersion: u32,
  entryKey: vaultEntryKeyEnvelopeSchema,
  memberIndex: memberIndexEnvelopeSchema,
}).strict().superRefine((item, context) => {
  const index = item.memberIndex.descriptor
  const entryKey = item.entryKey.descriptor
  if (item.entryId !== index.scope.entryId
    || item.entryId !== entryKey.scope.entryId
    || item.memberIndexRevision !== index.resourceRevision
    || item.currentKeyVersion !== entryKey.keyVersion
    || index.keyVersion !== item.currentKeyVersion
    || index.memberKeyGeneration !== entryKey.memberKeyGeneration) {
    context.addIssue({ code: 'custom', message: 'Member sync head binding mismatch' })
  }
})

const tombstoneSchema = z.object({
  entryId: canonicalUuid,
  kind: z.literal('tombstone'),
  state: z.null(),
  updatedAt: z.null(),
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
export type EncryptedVaultDetail = z.infer<typeof encryptedVaultDetailSchema>
export type MemberIndexEnvelope = z.infer<typeof memberIndexEnvelopeSchema>
export type VaultEntryKeyEnvelope = z.infer<typeof vaultEntryKeyEnvelopeSchema>
export type MemberSyncItem = z.infer<typeof memberSyncItemSchema>
export type MemberSnapshotPage = z.infer<typeof snapshotSchema>
export type MemberDeltaPage = z.infer<typeof deltaSchema>

const syncHeaders = {
  'X-Palladin-Vault-Protocol': '2',
  'X-Palladin-Sync-Policy': '1',
}

export async function readBoundedJson(response: Response): Promise<unknown> {
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

export async function getEncryptedVault(vaultId: string, signal?: AbortSignal): Promise<EncryptedVaultDetail> {
  const response = await api.get(`api/vaults/${vaultId}`, { signal, throwHttpErrors: false })
  return parseResponse(response, encryptedVaultDetailSchema)
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
