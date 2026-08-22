import { z } from 'zod'
import { api } from '../../../shared/api/client'
import { getPublicAssetsByIds } from '../../../shared/api/public-assets-api'

/** Agent lifecycle status — camelCase strings matching backend JsonStringEnumConverter. */
export const AGENT_STATUS_PENDING = 'pending' as const
export const AGENT_STATUS_ACTIVE = 'active' as const
export const AGENT_STATUS_DEACTIVATED = 'deactivated' as const

export type AgentStatus =
  | typeof AGENT_STATUS_PENDING
  | typeof AGENT_STATUS_ACTIVE
  | typeof AGENT_STATUS_DEACTIVATED

/** Agent type — camelCase strings matching backend JsonStringEnumConverter. */
export const AGENT_TYPE_OPEN_CLAW = 'openClaw' as const
export const AGENT_TYPE_CLAUDE_CODE = 'claudeCode' as const
export const AGENT_TYPE_HERMES = 'hermes' as const
export const AGENT_TYPE_CURSOR = 'cursor' as const
export const AGENT_TYPE_COPILOT = 'copilot' as const
export const AGENT_TYPE_GEMINI = 'gemini' as const
export const AGENT_TYPE_CODEX = 'codex' as const
export const AGENT_TYPE_KIMI_CODE = 'kimiCode' as const
export const AGENT_TYPE_DEVIN = 'devin' as const
export const AGENT_TYPE_AIDER = 'aider' as const
export const AGENT_TYPE_CLINE = 'cline' as const
export const AGENT_TYPE_ROO = 'roo' as const
export const AGENT_TYPE_OTHER = 'other' as const

export type AgentType =
  | typeof AGENT_TYPE_OPEN_CLAW
  | typeof AGENT_TYPE_CLAUDE_CODE
  | typeof AGENT_TYPE_HERMES
  | typeof AGENT_TYPE_CURSOR
  | typeof AGENT_TYPE_COPILOT
  | typeof AGENT_TYPE_GEMINI
  | typeof AGENT_TYPE_CODEX
  | typeof AGENT_TYPE_KIMI_CODE
  | typeof AGENT_TYPE_DEVIN
  | typeof AGENT_TYPE_AIDER
  | typeof AGENT_TYPE_CLINE
  | typeof AGENT_TYPE_ROO
  | typeof AGENT_TYPE_OTHER

/** Predefined built-in types — used as placeholder data before API responds. */
export const BUILTIN_AGENT_TYPES: string[] = [
  AGENT_TYPE_AIDER,
  AGENT_TYPE_CLAUDE_CODE,
  AGENT_TYPE_CLINE,
  AGENT_TYPE_CODEX,
  AGENT_TYPE_COPILOT,
  AGENT_TYPE_CURSOR,
  AGENT_TYPE_DEVIN,
  AGENT_TYPE_GEMINI,
  AGENT_TYPE_HERMES,
  AGENT_TYPE_KIMI_CODE,
  AGENT_TYPE_OPEN_CLAW,
  AGENT_TYPE_ROO,
  AGENT_TYPE_OTHER,
]

/**
 * Zod schema for a single agent — the single source of truth for the
 * `Agent` type. Parsing at the API boundary guards the UI against a
 * backend contract drift (missing fields, wrong status enum, etc.).
 */
export const agentSchema = z.object({
  agentId: z.string(),
  name: z.string().nullable(),
  status: z.enum(['pending', 'active', 'deactivated']),
  type: z.string().nullable(),
  iconKey: z.string().nullable(),
  iconColor: z.string().nullable(),
  publicKeyPrefix: z.string(),
  publicKeySuffix: z.string(),
  // Full base64 X25519 public key — returned by `GET /api/agents/{id}` so the
  // proactive-grant flow can seal a DEK to the agent. Optional until the
  // backend ships it; the list endpoint keeps returning only prefix/suffix.
  publicKey: z.string().nullable().optional(),
  recipientKeyVersion: z.number().int().positive().max(0xffffffff),
  createdAt: z.string(),
  enrolledAt: z.string().nullable(),
  enrolledByName: z.string().nullable(),
  deactivatedAt: z.string().nullable(),
  deactivatedByName: z.string().nullable(),
  reactivatedAt: z.string().nullable(),
  reactivatedByName: z.string().nullable(),
  description: z.string().nullable(),
  lastIp: z.string().nullable(),
  lastHostname: z.string().nullable(),
})

const agentListSchema = z.object({ items: z.array(agentSchema) })

const presignIconSchema = z.object({
  assetId: z.string().uuid(),
  uploadSessionId: z.string().uuid(),
  uploadUrl: z.string().url(),
  maximumBytes: z.number().int().positive(),
}).strict()

const completeIconSchema = z.object({
  assetId: z.string().uuid(),
  publicUrl: z.string().url(),
  revision: z.number().int().positive(),
})

export type Agent = z.infer<typeof agentSchema>

export interface UpdateAgentInput {
  name?: string
  description?: string
  type?: AgentType
  iconKey?: string
  iconColor?: string
}

export interface ApproveAgentInput {
  name?: string
  type?: AgentType
  iconKey?: string
  iconColor?: string
}

export async function getAgentTypes(): Promise<string[]> {
  const raw = await api.get('api/agents/types').json()
  return z.array(z.string()).parse(raw)
}

export async function getAgents(): Promise<Agent[]> {
  const raw = await api.get('api/agents').json()
  const agents = agentListSchema.parse(raw).items
  await hydrateAgentAssets(agents)
  return agents
}

export async function getAgent(agentId: string): Promise<Agent> {
  const raw = await api.get(`api/agents/${agentId}`).json()
  const agent = agentSchema.parse(raw)
  await hydrateAgentAssets([agent])
  return agent
}

async function hydrateAgentAssets(agents: Agent[]): Promise<void> {
  const ids = agents.flatMap((agent) =>
    agent.iconKey?.startsWith('public-asset:')
      ? [agent.iconKey.slice('public-asset:'.length)]
      : [],
  )
  if (ids.length > 0) await getPublicAssetsByIds(ids)
}

export async function approveAgent(
  agentId: string,
  input?: ApproveAgentInput,
): Promise<void> {
  await api.post(`api/agents/${agentId}/approve`, { json: input ?? {} })
}

export async function deactivateAgent(agentId: string): Promise<void> {
  await api.post(`api/agents/${agentId}/deactivate`)
}

export async function reactivateAgent(agentId: string): Promise<void> {
  await api.post(`api/agents/${agentId}/reactivate`)
}

/** Hard-deletes a deactivated agent (backend rejects active/pending with 409). */
export async function deleteAgent(agentId: string): Promise<void> {
  await api.delete(`api/agents/${agentId}`)
}

export async function updateAgent(
  agentId: string,
  input: UpdateAgentInput,
): Promise<void> {
  await api.patch(`api/agents/${agentId}`, { json: input })
}

export async function presignAgentIcon(
  agentId: string,
  input: { mediaType: string; byteLength: number; sha256: string },
): Promise<z.infer<typeof presignIconSchema>> {
  const raw = await api
    .post(`api/agents/${agentId}/icon/presign`, { json: { agentId, ...input } })
    .json()
  return presignIconSchema.parse(raw)
}

export async function completeAgentIconUpload(
  agentId: string,
  uploadSessionId: string,
): Promise<z.infer<typeof completeIconSchema>> {
  const raw = await api.post(`api/agents/${agentId}/icon/complete`, {
    json: { agentId, uploadSessionId },
  }).json()
  return completeIconSchema.parse(raw)
}
