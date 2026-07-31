import { z } from 'zod'
import { api } from '../../../shared/api/client'
import { readBoundedJson, vaultEntryKeyEnvelopeSchema } from '../sync/member-sync-api'
import {
  canonicalU64Schema as u64,
  canonicalUuidSchema as uuid,
  u32Schema as u32,
  vaultDiscoveryKeyEnvelopeSchema as discoveryKeySchema,
  memberVaultKeyEnvelopeSchema,
  memberVaultMetadataEnvelopeSchema,
  vaultPrivateKeyEnvelopeSchema as privateKeySchema,
} from '../sync/vault-key-material-schema'
import { agentDiscoveryEnvelopeSchema } from '../sync/entry-envelope-schema'


export const memberVaultKeySchema = memberVaultKeyEnvelopeSchema
export { vaultDiscoveryKeyEnvelopeSchema as discoveryKeySchema,
  vaultPrivateKeyEnvelopeSchema as privateKeySchema } from '../sync/vault-key-material-schema'
const epoch = z.object({
  vaultKeyVersion: u32, vdkVersion: u32, agentMessageKeyVersion: u32, manifestSigningKeyVersion: u32,
}).strict()
export const rotationSchema = z.object({
  id: uuid, vaultId: uuid, status: z.string(), cause: z.string(), scope: z.array(z.string()),
  baseMemberKeyGeneration: u32, targetMemberKeyGeneration: u32,
  baseKeyEpoch: epoch, targetKeyEpoch: epoch, baseMemberSequence: u64, baseDiscoverySequence: u64,
  leaseRevision: z.number().int().nonnegative(), leaseOwnerId: uuid.nullable(), leaseExpiresAt: z.string().nullable(),
  triggeredAt: z.string(), committedAt: z.string().nullable(), lastFailureCode: z.string().nullable(),
}).strict()
const claimSchema = z.object({
  rotation: rotationSchema, fencingToken: uuid, currentMemberVaultKey: memberVaultKeySchema,
  currentDiscoveryKey: discoveryKeySchema, currentVaultPrivateKeys: z.array(privateKeySchema).max(2),
  pendingMemberVaultKey: memberVaultKeySchema.nullable(), pendingDiscoveryKey: discoveryKeySchema.nullable(),
  pendingVaultPrivateKeys: z.array(privateKeySchema).max(2), preparedMaterialReset: z.boolean(),
}).strict()
const memberSourceSchema = z.object({
  items: z.array(z.object({ memberId: uuid, recipientKeyVersion: u32, recipientKeyFingerprint: z.string(), x25519PublicKey: z.string() }).strict()).max(100),
  nextAfterId: uuid.nullable(),
}).strict()
const entryKeySourceSchema = z.object({
  items: z.array(vaultEntryKeyEnvelopeSchema).max(100), nextAfterId: uuid.nullable(), nextAfterVersion: u32.nullable(),
}).strict()
export const agentDiscoverySchema = agentDiscoveryEnvelopeSchema
const discoverySourceSchema = z.object({
  items: z.array(z.object({ sourceRevision: u64, envelope: agentDiscoverySchema }).strict()).max(100),
  nextAfterId: uuid.nullable(),
}).strict()
const agentSourceSchema = z.object({
  items: z.array(z.object({
    agentId: uuid, agentName: z.string().nullable(), x25519PublicKey: z.string(), ed25519PublicKey: z.string(),
    recipientKeyVersion: u32, status: z.string(), manifestRevision: u64.nullable(),
  }).strict()).max(100),
  nextAfterId: uuid.nullable(),
}).strict()
const vaultSummarySchema = z.object({
  id: uuid, memberVaultMetadata: memberVaultMetadataEnvelopeSchema,
}).passthrough()
const listVaultsSchema = z.object({ vaults: z.array(vaultSummarySchema), total: z.number().int().nonnegative() }).strict()

export type VaultRotation = z.infer<typeof rotationSchema>
export type RotationClaim = z.infer<typeof claimSchema>
export type RotationMemberSource = z.infer<typeof memberSourceSchema>['items'][number]
export type RotationEntryKey = z.infer<typeof vaultEntryKeyEnvelopeSchema>
export type RotationDiscovery = z.infer<typeof discoverySourceSchema>['items'][number]
export type RotationAgentSource = z.infer<typeof agentSourceSchema>['items'][number]
export type MemberVaultKeyContract = z.infer<typeof memberVaultKeySchema>
export type DiscoveryKeyContract = z.infer<typeof discoveryKeySchema>
export type PrivateKeyContract = z.infer<typeof privateKeySchema>

async function json<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok) throw new RotationHttpError(response.status)
  return schema.parse(await readBoundedJson(response))
}

export class RotationHttpError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Vault rotation request failed with status ${status}`)
    this.status = status
  }
}

export async function listPendingRotations(signal: AbortSignal): Promise<VaultRotation[]> {
  const response = await api.get('api/vault-key-rotations/pending', { signal, throwHttpErrors: false })
  return (await json(response, z.object({ items: z.array(rotationSchema).max(200) }).strict())).items
}

export async function claimRotation(vaultId: string, rotationId: string, signal: AbortSignal): Promise<RotationClaim> {
  const response = await api.post(`api/vaults/${vaultId}/key-rotations/${rotationId}/claim`, {
    json: { vaultId, rotationId }, signal, throwHttpErrors: false,
  })
  return json(response, claimSchema)
}

function cursorParams(fencingToken: string, afterId: string | null, afterVersion?: number | null) {
  return { fencingToken, pageSize: 100, ...(afterId ? { afterId } : {}), ...(afterVersion != null ? { afterVersion } : {}) }
}

export async function getRotationMembers(vaultId: string, rotationId: string, fencingToken: string, afterId: string | null, signal: AbortSignal) {
  const response = await api.get(`api/vaults/${vaultId}/key-rotations/${rotationId}/source/members`, {
    searchParams: cursorParams(fencingToken, afterId), signal, throwHttpErrors: false,
  })
  return json(response, memberSourceSchema)
}

export async function getRotationEntryKeys(vaultId: string, rotationId: string, fencingToken: string, afterId: string | null, afterVersion: number | null, signal: AbortSignal) {
  const response = await api.get(`api/vaults/${vaultId}/key-rotations/${rotationId}/source/entry-keys`, {
    searchParams: cursorParams(fencingToken, afterId, afterVersion), signal, throwHttpErrors: false,
  })
  return json(response, entryKeySourceSchema)
}

export async function getRotationDiscoveries(vaultId: string, rotationId: string, fencingToken: string, afterId: string | null, signal: AbortSignal) {
  const response = await api.get(`api/vaults/${vaultId}/key-rotations/${rotationId}/source/discoveries`, {
    searchParams: cursorParams(fencingToken, afterId), signal, throwHttpErrors: false,
  })
  return json(response, discoverySourceSchema)
}

export async function getRotationAgents(vaultId: string, afterId: string | null, signal: AbortSignal) {
  const response = await api.get(`api/vaults/${vaultId}/discovery/agents`, {
    searchParams: { pageSize: 100, ...(afterId ? { afterId } : {}) }, signal, throwHttpErrors: false,
  })
  return json(response, agentSourceSchema)
}

export async function getVaultMetadata(vaultId: string, signal: AbortSignal) {
  let offset = 0
  while (true) {
    const response = await api.get('api/vaults', { searchParams: { limit: 200, offset }, signal, throwHttpErrors: false })
    const page = await json(response, listVaultsSchema)
    const found = page.vaults.find((vault) => vault.id === vaultId)
    if (found) return found.memberVaultMetadata
    offset += page.vaults.length
    if (offset >= page.total || page.vaults.length === 0) throw new RotationHttpError(404)
  }
}

export interface RotationBatch {
  memberVaultMetadata?: unknown
  memberVaultKeys?: unknown[]
  entryKeys?: unknown[]
  entryDiscoveries?: unknown[]
  agentDiscoveries?: unknown[]
  discoveryKey?: unknown
  vaultPrivateKeys?: unknown[]
}

export async function prepareRotationBatch(vaultId: string, rotationId: string, fencingToken: string, batch: RotationBatch, signal: AbortSignal) {
  const response = await api.put(`api/vaults/${vaultId}/key-rotations/${rotationId}/batch`, {
    json: { vaultId, rotationId, fencingToken, memberVaultKeys: [], entryKeys: [], entryDiscoveries: [], agentDiscoveries: [], vaultPrivateKeys: [], ...batch },
    signal, throwHttpErrors: false,
  })
  return json(response, z.object({ acceptedItems: z.number().int().nonnegative(), totalPreparedItems: z.number().int().nonnegative() }).strict())
}

export async function commitRotation(vaultId: string, rotationId: string, fencingToken: string, signal: AbortSignal): Promise<Response> {
  return api.post(`api/vaults/${vaultId}/key-rotations/${rotationId}/commit`, {
    json: { vaultId, rotationId, fencingToken }, signal, throwHttpErrors: false,
  })
}
