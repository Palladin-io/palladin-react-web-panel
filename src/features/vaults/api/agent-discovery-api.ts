import { z } from 'zod'
import { api } from '../../../shared/api/client'

export const DISCOVERY_STATUS_CURRENT = 'current' as const
export const DISCOVERY_STATUS_PENDING = 'pending' as const

const canonicalU64 = z.string()
  .regex(/^(0|[1-9][0-9]{0,19})$/)
  .refine((value) => BigInt(value) <= 0xffffffffffffffffn)

const agentDiscoveryProvisioningItemSchema = z.object({
  agentId: z.string().uuid(),
  agentName: z.string().max(200).nullable(),
  x25519PublicKey: z.string().max(512),
  ed25519PublicKey: z.string().max(512),
  recipientKeyVersion: z.number().int().positive().max(0xffffffff),
  status: z.enum([DISCOVERY_STATUS_CURRENT, DISCOVERY_STATUS_PENDING]),
  manifestRevision: canonicalU64.nullable(),
}).strict().transform(({ agentId, agentName, x25519PublicKey, ed25519PublicKey, recipientKeyVersion, status, manifestRevision }) => ({
  agentId,
  agentName,
  x25519PublicKey,
  ed25519PublicKey,
  recipientKeyVersion,
  status,
  manifestRevision,
}))

const agentDiscoveryProvisioningResponseSchema = z.object({
  items: z.array(agentDiscoveryProvisioningItemSchema).max(1_000),
  nextAfterId: z.string().uuid().nullable(),
}).strict()

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
