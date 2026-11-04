import { z } from 'zod'
import { api } from '../../../shared/api/client'
import { KEY_WRAPPER_SUITE } from '../../../shared/crypto/key-wrapper'

export const DISCOVERY_STATUS_CURRENT = 'current' as const
export const DISCOVERY_STATUS_PENDING = 'pending' as const

const canonicalU64 = z.string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= 0xffffffffffffffffn)

// recipient-key-publication: the encryption key names its suite; rows without one are legacy.
const agentDiscoveryProvisioningItemSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string().max(200).nullable(),
  publicKey: z.string().max(2048),
  keySuiteId: z.string().max(64).nullable().optional(),
  ed25519PublicKey: z.string().max(512),
  recipientKeyVersion: z.number().int().positive().max(0xffffffff),
  status: z.enum([DISCOVERY_STATUS_CURRENT, DISCOVERY_STATUS_PENDING]),
  manifestRevision: canonicalU64.nullable(),
}).transform(({ agentId, agentName, publicKey, keySuiteId, ed25519PublicKey, recipientKeyVersion, status, manifestRevision }) => ({
  agentId,
  agentName,
  encryptionPublicKey: publicKey,
  encryptionKeySuiteId: keySuiteId ?? KEY_WRAPPER_SUITE.legacy,
  ed25519PublicKey,
  recipientKeyVersion,
  status,
  manifestRevision,
}))

const agentDiscoveryProvisioningResponseSchema = z.object({
  items: z.array(agentDiscoveryProvisioningItemSchema).max(1_000),
  nextAfterId: z.string().uuid().nullable(),
})

export type AgentDiscoveryProvisioningItem = z.infer<typeof agentDiscoveryProvisioningItemSchema>

export async function getAgentDiscoveryProvisioning(
  vaultId: string,
  afterId?: string,
  signal?: AbortSignal,
): Promise<z.infer<typeof agentDiscoveryProvisioningResponseSchema>> {
  const raw = await api.get(`api/vaults/${vaultId}/discovery/agents`, {
    searchParams: { pageSize: 100, ...(afterId ? { afterId } : {}) }, signal,
  }).json()
  return agentDiscoveryProvisioningResponseSchema.parse(raw)
}

export async function provisionAgentDiscovery(vaultId: string, agentId: string, material: {
  envelope: unknown
  manifest: unknown
}, signal?: AbortSignal): Promise<void> {
  await api.put(`api/vaults/${vaultId}/discovery/agents/${agentId}`, {
    json: { vaultId, agentId, envelope: material.envelope, manifest: material.manifest },
    signal,
  })
}
