import { z } from 'zod'
import { api } from '../../../shared/api/client'
import { parseJwtPayload } from '../../../shared/lib/jwt'
import { useAuthStore } from '../../auth'
import {
  canonicalU64Schema as canonicalU64,
  canonicalUuidSchema as canonicalUuid,
  memberVaultKeyEnvelopeSchema,
  memberVaultMetadataEnvelopeSchema,
  u32Schema as u32,
  vaultDiscoveryKeyEnvelopeSchema,
  vaultPrivateKeyEnvelopeSchema,
} from './vault-key-material-schema'
import {
  memberIndexEnvelopeSchema,
  memberSecretEnvelopeSchema,
  vaultEntryKeyEnvelopeSchema,
} from './entry-envelope-schema'
export {
  memberIndexEnvelopeSchema,
  memberSecretEnvelopeSchema,
  vaultEntryKeyEnvelopeSchema,
} from './entry-envelope-schema'

const MAXIMUM_SYNC_RESPONSE_BYTES = 4 * 1024 * 1024
const syncCursor = z.string().max(2_048)
// The backend serializes NodaTime Instant with up to nanosecond precision.
const canonicalInstantSchema = z.string()
  .refine((value) => parseCanonicalInstantNanoseconds(value) !== null)
const offlinePolicySchema = z.enum(['disabled', '1h', '4h', '24h'])
const offlinePolicyDurations = {
  disabled: 0,
  '1h': 60 * 60 * 1_000,
  '4h': 4 * 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
} as const

function parseCanonicalInstantNanoseconds(value: string): bigint | null {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return null
  const milliseconds = Date.parse(`${match[1]}Z`)
  return BigInt(milliseconds) * 1_000_000n + BigInt((match[2] ?? '').padEnd(9, '0'))
}

function validateOfflineLeaseDuration(
  access: { issuedAt: string; notAfter: string; offlinePolicy: keyof typeof offlinePolicyDurations },
  context: z.RefinementCtx,
): void {
  const issuedAt = parseCanonicalInstantNanoseconds(access.issuedAt)
  const notAfter = parseCanonicalInstantNanoseconds(access.notAfter)
  if (issuedAt === null || notAfter === null) return
  const duration = notAfter - issuedAt
  const maximumDuration = BigInt(offlinePolicyDurations[access.offlinePolicy]) * 1_000_000n
  if (duration < 0n || duration > maximumDuration) {
    context.addIssue({ code: 'custom', message: 'Member sync offline lease exceeds its authenticated policy' })
  }
}

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
}).superRefine((vault, context) => {
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
}).superRefine((key, context) => {
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
  memberSecret: memberSecretEnvelopeSchema,
}).superRefine((item, context) => {
  const index = item.memberIndex.descriptor
  const secret = item.memberSecret.descriptor
  const entryKey = item.entryKey.descriptor
  if (item.entryId !== index.scope.entryId
    || item.entryId !== secret.scope.entryId
    || item.entryId !== entryKey.scope.entryId
    || item.memberIndexRevision !== index.resourceRevision
    || item.currentRevision !== item.memberIndexRevision
    || item.currentRevision !== secret.resourceRevision
    || item.currentKeyVersion !== entryKey.keyVersion
    || index.keyVersion !== item.currentKeyVersion
    || secret.keyVersion !== item.currentKeyVersion
    || index.memberKeyGeneration !== entryKey.memberKeyGeneration
    || secret.memberKeyGeneration !== entryKey.memberKeyGeneration) {
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
  memberSecret: z.null(),
})

export const memberSyncItemSchema = z.discriminatedUnion('kind', [headSchema, tombstoneSchema])

const listVaultsSchema = z.object({
  vaults: z.array(encryptedVaultSummarySchema).max(200),
  total: z.number().int().nonnegative(),
})

export const currentMemberEntryAccessContextSchema = z.object({
  contextVersion: z.literal(1),
  principalId: canonicalUuid,
  organizationId: canonicalUuid,
  organizationMembershipGeneration: canonicalU64,
  vaultId: canonicalUuid,
  memberId: canonicalUuid,
  memberKeyGeneration: u32,
  vaultKeyVersion: u32,
  memberRecipientKeyVersion: u32,
  memberRecipientKeyFingerprint: z.string().min(1),
  offlinePolicy: offlinePolicySchema,
  offlinePolicyVersion: u32,
  issuedAt: canonicalInstantSchema,
  notAfter: canonicalInstantSchema,
}).strict().superRefine(validateOfflineLeaseDuration)

const currentMemberPageAuthorityShape = {
  accessContext: currentMemberEntryAccessContextSchema,
  memberVaultKey: memberVaultKeyEnvelopeSchema,
} as const
export type CurrentMemberPageAuthority = {
  accessContext: z.infer<typeof currentMemberEntryAccessContextSchema>
  memberVaultKey: z.infer<typeof memberVaultKeyEnvelopeSchema>
}

function assertPageVaultKeyAuthority(
  page: CurrentMemberPageAuthority,
  context: z.RefinementCtx,
): void {
  const access = page.accessContext
  const wrapper = page.memberVaultKey.wrappedVaultKey.descriptor
  if (wrapper.scope.organizationId !== access.organizationId
    || wrapper.scope.vaultId !== access.vaultId
    || wrapper.scope.memberId !== access.memberId
    || wrapper.wrappedKeyVersion !== access.vaultKeyVersion
    || wrapper.memberKeyGeneration !== access.memberKeyGeneration
    || wrapper.recipientKeyVersion !== access.memberRecipientKeyVersion
    || wrapper.recipientFingerprint !== access.memberRecipientKeyFingerprint) {
    context.addIssue({ code: 'custom', message: 'Member sync Vault-key authority mismatch' })
  }
}

function assertPageItemsMatchAuthority(
  page: { accessContext: CurrentMemberEntryAccessContext, items: MemberSyncItem[] },
  context: z.RefinementCtx,
): void {
  for (const item of page.items) {
    if (item.kind === 'tombstone') continue
    const descriptors = [item.entryKey.descriptor, item.memberIndex.descriptor, item.memberSecret.descriptor]
    if (descriptors.some((descriptor) => descriptor.scope.organizationId !== page.accessContext.organizationId
      || descriptor.scope.vaultId !== page.accessContext.vaultId
      || descriptor.scope.entryId !== item.entryId
      || descriptor.memberKeyGeneration !== page.accessContext.memberKeyGeneration)
      || item.entryKey.descriptor.binding.wrappingVaultKeyVersion !== page.accessContext.vaultKeyVersion) {
      context.addIssue({ code: 'custom', message: 'Member sync item access-context mismatch' })
      return
    }
  }
}

export const memberSnapshotPageSchema = z.object({
  ...currentMemberPageAuthorityShape,
  snapshotBaseSequence: canonicalU64,
  items: z.array(memberSyncItemSchema).max(200),
  nextCursor: syncCursor.nullable(),
}).superRefine((page, context) => {
  assertPageVaultKeyAuthority(page, context)
  assertPageItemsMatchAuthority(page, context)
})

export const memberDeltaPageSchema = z.object({
  ...currentMemberPageAuthorityShape,
  deltaUpperBound: canonicalU64,
  appliedThroughSequence: canonicalU64,
  items: z.array(memberSyncItemSchema).max(200),
  continuationCursor: syncCursor.nullable(),
}).superRefine((page, context) => {
  assertPageVaultKeyAuthority(page, context)
  assertPageItemsMatchAuthority(page, context)
})

const resetSchema = z.object({
  outcome: z.literal('resetRequired'),
  currentSequence: canonicalU64,
  minRetainedSequence: canonicalU64,
  newSnapshotRequired: z.literal(true),
})

export type EncryptedVaultSummary = z.infer<typeof encryptedVaultSummarySchema>
export type EncryptedVaultDetail = z.infer<typeof encryptedVaultDetailSchema>
export type MemberIndexEnvelope = z.infer<typeof memberIndexEnvelopeSchema>
export type VaultEntryKeyEnvelope = z.infer<typeof vaultEntryKeyEnvelopeSchema>
export type CurrentMemberEntryAccessContext = z.infer<typeof currentMemberEntryAccessContextSchema>
export type MemberSyncItem = z.infer<typeof memberSyncItemSchema>
export type MemberSnapshotPage = z.infer<typeof memberSnapshotPageSchema>
export type MemberDeltaPage = z.infer<typeof memberDeltaPageSchema>

const syncHeaders = {
  'X-Palladin-Vault-Protocol': '2',
  'X-Palladin-Sync-Policy': '2',
}

function assertAuthenticatedRequestAuthority(access: CurrentMemberEntryAccessContext): void {
  const token = useAuthStore.getState().accessToken
  if (!token) throw new Error('Member sync response has no authenticated request authority')
  const claims = parseJwtPayload(token)
  const policy = ({ '0': 'disabled', '1': '1h', '2': '4h', '3': '24h' } as const)[String(claims.org_offline_policy) as '0' | '1' | '2' | '3']
  if (claims.sub !== access.principalId
    || claims.org_id !== access.organizationId
    || String(claims.authz_ver) !== access.organizationMembershipGeneration
    || policy !== access.offlinePolicy
    || String(claims.org_offline_policy_ver) !== String(access.offlinePolicyVersion)) {
    throw new Error('Member sync response does not match the authenticated request authority')
  }
}

export function assertMemberSyncPageAuthority(
  page: CurrentMemberPageAuthority,
  vault: EncryptedVaultSummary,
  userId: string,
): void {
  const access = page.accessContext
  const organizationId = vault.memberVaultKey.wrappedVaultKey.descriptor.scope.organizationId
  if (access.principalId !== userId
    || access.memberId !== userId
    || access.organizationId !== organizationId
    || access.vaultId !== vault.id
    || access.memberKeyGeneration !== vault.memberKeyGeneration
    || access.vaultKeyVersion !== vault.currentKeyEpoch.vaultKeyVersion
    || JSON.stringify(page.memberVaultKey) !== JSON.stringify(vault.memberVaultKey)) {
    throw new Error('Member sync page does not match the authoritative Vault summary')
  }
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

export class MemberSyncAccessDeniedError extends Error {
  constructor() {
    super('Current Member Entry sync access was denied')
  }
}

function assertSyncAccess(response: Response): void {
  if (response.status === 403) throw new MemberSyncAccessDeniedError()
}

export async function listEncryptedVaults(signal?: AbortSignal): Promise<EncryptedVaultSummary[]> {
  const vaults: EncryptedVaultSummary[] = []
  let offset = 0
  let total: number | undefined
  do {
    const response = await api.get('api/vaults', {
      searchParams: { limit: 200, offset }, signal, throwHttpErrors: false,
    })
    assertSyncAccess(response)
    if (!response.ok) throw new Error(`Vault list request failed with status ${response.status}`)
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
  const response = await api.post(`api/vaults/${vaultId}/current-entries/sync/snapshot`, {
    headers: syncHeaders,
    json: { vaultId, cursor, pageSize: 100 },
    signal,
    throwHttpErrors: false,
  })
  assertSyncAccess(response)
  const page = await parseResponse(response, memberSnapshotPageSchema)
  if (page.accessContext.vaultId !== vaultId) throw new Error('Member snapshot route scope mismatch')
  assertAuthenticatedRequestAuthority(page.accessContext)
  return page
}

export async function getMemberDeltaPage(
  vaultId: string,
  afterSequence: string | null,
  continuationCursor: string | null,
  signal?: AbortSignal,
): Promise<MemberDeltaPage> {
  const response = await api.post(`api/vaults/${vaultId}/current-entries/sync/delta`, {
    headers: syncHeaders,
    json: continuationCursor ? { vaultId, continuationCursor, pageSize: 100 } : { vaultId, afterSequence, pageSize: 100 },
    signal,
    throwHttpErrors: false,
  })
  assertSyncAccess(response)
  if (response.status === 409) throw new MemberSyncResetRequiredError(resetSchema.parse(await readBoundedJson(response)))
  const page = await parseResponse(response, memberDeltaPageSchema)
  if (page.accessContext.vaultId !== vaultId) throw new Error('Member delta route scope mismatch')
  assertAuthenticatedRequestAuthority(page.accessContext)
  return page
}
