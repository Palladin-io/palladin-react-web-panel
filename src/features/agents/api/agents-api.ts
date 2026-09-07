import { z } from 'zod'
import { api } from '../../../shared/api/client'
import { getPublicAssetsByIds } from '../../../shared/api/public-assets-api'

/** Agent lifecycle status — camelCase strings matching backend JsonStringEnumConverter. */
export const AGENT_STATUS_PENDING = 'pending' as const
export const AGENT_STATUS_ACTIVE = 'active' as const
export const AGENT_STATUS_DEACTIVATED = 'deactivated' as const
export const AGENT_STATUS_DEACTIVATING = 'deactivating' as const

export type AgentStatus =
  | typeof AGENT_STATUS_PENDING
  | typeof AGENT_STATUS_ACTIVE
  | typeof AGENT_STATUS_DEACTIVATED
  | typeof AGENT_STATUS_DEACTIVATING

/** Known Agent types are presentation suggestions; the domain contract remains a string. */
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

export type AgentType = string

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

/** Version-matched response contract owned by the Palladin backend. */
export interface Agent {
  agentId: string
  name: string | null
  status: AgentStatus
  type: string | null
  iconKey: string | null
  iconColor: string | null
  publicKeyPrefix: string
  publicKeySuffix: string
  // Full base64 X25519 public key — returned by `GET /api/agents/{id}` so the
  // proactive-grant flow can seal a DEK to the agent. Optional until the
  // backend ships it; the list endpoint keeps returning only prefix/suffix.
  publicKey?: string | null
  recipientKeyVersion: number
  /** Pending agents legitimately use epoch 0; backend owns lifecycle validity. */
  accessEpoch: number
  createdAt: string
  enrolledAt: string | null
  enrolledByName: string | null
  deactivatedAt: string | null
  deactivatedByName: string | null
  reactivatedAt: string | null
  reactivatedByName: string | null
  description: string | null
  lastIp: string | null
  lastHostname: string | null
}

interface AgentListResponse { items: Agent[] }

const presignIconSchema = z.object({
  assetId: z.string().uuid(),
  uploadSessionId: z.string().uuid(),
  uploadUrl: z.string().url(),
  maximumBytes: z.number().int().positive(),
})

const completeIconSchema = z.object({
  assetId: z.string().uuid(),
  publicUrl: z.string().url(),
  revision: z.number().int().positive(),
})

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

export interface AgentPairingApiKeyOption {
  apiKeyId: string
  name: string
  keyHint: string
}

export interface AgentPairingClaim {
  hostname?: string | null
  ip?: string | null
  pairingId: string
  displayName: string | null
  reservedDisplayName: string | null
  type: string | null
  publicKeyHint: string
  expiresAt: string
  canCreateApiKey: boolean
  apiKeys: AgentPairingApiKeyOption[]
}

// Route params are an independent browser-input boundary. Validate before
// interpolation so an encoded slash or dot segment can never retarget an
// authenticated POST to another Palladin endpoint.
const agentPairingIdSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
)

function agentPairingPath(pairingId: string): string {
  return `api/agent-pairings/${encodeURIComponent(agentPairingIdSchema.parse(pairingId))}`
}

export async function claimAgentPairing(pairingId: string): Promise<AgentPairingClaim> {
  const path = agentPairingPath(pairingId)
  return api
    .post(`${path}/claim`, { json: { pairingId } })
    .json<AgentPairingClaim>()
}

export async function claimAgentPairingForNewKey(pairingId: string): Promise<AgentPairingClaim> {
  return api.post(`${agentPairingPath(pairingId)}/claim-for-new-key`, { json: { pairingId } })
    .json<AgentPairingClaim>()
}

export async function reserveAgentPairingDisplayName(
  pairingId: string,
  displayName: string,
): Promise<void> {
  await api.post(`${agentPairingPath(pairingId)}/display-name/reserve`, {
    json: { pairingId, displayName },
  })
}

export async function approveAgentPairing(
  pairingId: string,
  input: { displayName: string; apiKeyId: string; iconKey?: string },
): Promise<{ agentId: string }> {
  return api
    .post(`${agentPairingPath(pairingId)}/approve`, {
      json: { pairingId, ...input },
    })
    .json<{ agentId: string }>()
}

export async function approveAgentPairingWithNewKey(
  pairingId: string,
  input: { displayName: string; newApiKeyName: string; iconKey?: string },
): Promise<{ agentId: string }> {
  return api.post(`${agentPairingPath(pairingId)}/approve-with-new-key`, {
    json: { pairingId, ...input },
  }).json<{ agentId: string }>()
}

export async function rejectAgentPairing(pairingId: string): Promise<void> {
  await api.post(`${agentPairingPath(pairingId)}/reject`, { json: { pairingId } })
}

export async function getAgentTypes(): Promise<string[]> {
  const raw = await api.get('api/agents/types').json()
  return z.array(z.string()).parse(raw)
}

export async function getAgents(): Promise<Agent[]> {
  const agents = (await api.get('api/agents').json<AgentListResponse>()).items
  await hydrateAgentAssets(agents)
  return agents
}

export async function getAgent(agentId: string): Promise<Agent> {
  const agent = await api.get(`api/agents/${agentId}`).json<Agent>()
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
