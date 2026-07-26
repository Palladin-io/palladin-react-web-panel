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
}).strict().transform(({ agentId, agentName, recipientKeyVersion, status, manifestRevision }) => ({
  agentId,
  agentName,
  recipientKeyVersion,
  status,
  manifestRevision,
}))

const agentDiscoveryProvisioningResponseSchema = z.object({
  items: z.array(agentDiscoveryProvisioningItemSchema).max(1_000),
}).strict()

export type AgentDiscoveryProvisioningItem = z.infer<typeof agentDiscoveryProvisioningItemSchema>

export async function getAgentDiscoveryProvisioning(
  vaultId: string,
): Promise<AgentDiscoveryProvisioningItem[]> {
  const raw = await api.get(`api/vaults/${vaultId}/discovery/agents`).json()
  return agentDiscoveryProvisioningResponseSchema.parse(raw).items
}
