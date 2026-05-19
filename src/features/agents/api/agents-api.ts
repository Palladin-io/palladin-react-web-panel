import { z } from 'zod'
import { api } from '../../../shared/api/client'

/** Agent lifecycle status — camelCase strings matching backend JsonStringEnumConverter. */
export const AGENT_STATUS_PENDING = 'pending' as const
export const AGENT_STATUS_ACTIVE = 'active' as const
export const AGENT_STATUS_DEACTIVATED = 'deactivated' as const

export type AgentStatus =
  | typeof AGENT_STATUS_PENDING
  | typeof AGENT_STATUS_ACTIVE
  | typeof AGENT_STATUS_DEACTIVATED

/**
 * Zod schema for a single agent — the single source of truth for the
 * `Agent` type. Parsing at the API boundary guards the UI against a
 * backend contract drift (missing fields, wrong status enum, etc.).
 */
const agentSchema = z.object({
  agentId: z.string(),
  name: z.string().nullable(),
  status: z.enum(['pending', 'active', 'deactivated']),
  publicKeySuffix: z.string(),
  createdAt: z.string(),
  enrolledAt: z.string().nullable(),
  enrolledByName: z.string().nullable(),
  deactivatedAt: z.string().nullable(),
  deactivatedByName: z.string().nullable(),
  description: z.string().nullable(),
})

const agentListSchema = z.object({ items: z.array(agentSchema) })

export type Agent = z.infer<typeof agentSchema>

export interface UpdateAgentInput {
  name?: string
  description?: string
}

export async function getAgents(): Promise<Agent[]> {
  const raw = await api.get('api/agents').json()
  return agentListSchema.parse(raw).items
}

export async function getAgent(agentId: string): Promise<Agent> {
  const raw = await api.get(`api/agents/${agentId}`).json()
  return agentSchema.parse(raw)
}

export async function approveAgent(agentId: string): Promise<void> {
  await api.post(`api/agents/${agentId}/approve`)
}

export async function deactivateAgent(agentId: string): Promise<void> {
  await api.post(`api/agents/${agentId}/deactivate`)
}

export async function reactivateAgent(agentId: string): Promise<void> {
  await api.post(`api/agents/${agentId}/reactivate`)
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<void> {
  await api.patch(`api/agents/${agentId}`, { json: input })
}
