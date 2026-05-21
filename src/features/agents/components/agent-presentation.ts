import {
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
  type Agent,
  type AgentType,
} from '../api/agents-api'

/** Preset icons shown in the row (AI / automation themed). */
export const AGENT_ICON_OPTIONS = [
  'smart_toy', 'memory', 'hub', 'token', 'terminal',
  'psychology', 'auto_mode', 'support_agent', 'dns', 'code', 'api',
  'cloud', 'extension', 'bolt', 'developer_mode',
] as const

/** Accent colour per agent icon glyph. */
export const AGENT_ICON_COLORS: Record<string, string> = {
  smart_toy: '#2EC4B6',
  memory: '#8A95A6',
  hub: '#60A5FA',
  token: '#A78BFA',
  terminal: '#2EC4B6',
  psychology: '#A78BFA',
  auto_mode: '#2EC4B6',
  support_agent: '#60A5FA',
  dns: '#8A95A6',
  code: '#2EC4B6',
  api: '#2EC4B6',
  extension: '#A78BFA',
  computer: '#60A5FA',
  bolt: '#FFAB87',
  cloud: '#60A5FA',
  assistant: '#A78BFA',
  data_object: '#2EC4B6',
  precision_manufacturing: '#FFAB87',
  settings_suggest: '#8A95A6',
  manage_search: '#60A5FA',
  batch_prediction: '#A78BFA',
  android: '#2EC4B6',
  biotech: '#2EC4B6',
  developer_mode: '#2EC4B6',
}

/** Full browsable icon set (shown in the icon browser modal). */
export const AGENT_ICON_ALL = [
  'smart_toy', 'memory', 'hub', 'token', 'terminal', 'psychology', 'auto_mode', 'support_agent', 'dns',
  'code', 'api', 'extension', 'computer', 'bolt', 'cloud', 'assistant', 'data_object',
  'precision_manufacturing', 'settings_suggest', 'manage_search', 'batch_prediction', 'android',
  'biotech', 'developer_mode',
] as const

/**
 * Deterministic avatar palette for agents. The colour is picked from the
 * first character of the agent name (or id, when unnamed) so the same
 * agent always renders with the same tint across list and detail views.
 */
const AVATAR_PALETTE = [
  '#2EC4B6',
  '#FF4F4F',
  '#FFAB87',
  '#F0C040',
  '#5B8DEF',
  '#A78BFA',
  '#34D399',
  '#F97316',
] as const

/** Picks a stable avatar colour for an agent. */
export function agentAvatarColor(agent: Pick<Agent, 'name' | 'agentId'>): string {
  const seed = (agent.name?.trim() || agent.agentId || '').trim()
  if (seed.length === 0) return AVATAR_PALETTE[0]
  const code = seed.charCodeAt(0)
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length]
}

/**
 * Initials derived from the agent name — first letter of up to two words.
 * Returns an empty string when there is no name so callers can fall back
 * to the `smart_toy` glyph.
 */
export function agentInitials(name: string | null): string {
  const trimmed = name?.trim() ?? ''
  if (trimmed.length === 0) return ''
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Human-readable fallback name used wherever an agent has no name yet. */
export function agentDisplayName(
  agent: Pick<Agent, 'name'>,
  fallback: string,
): string {
  return agent.name?.trim() || fallback
}

/** i18n key for the human-readable label of an agent type. */
export function agentTypeLabelKey(type: AgentType): string {
  switch (type) {
    case AGENT_TYPE_OPEN_CLAW:  return 'agents.typeOpenClaw'
    case AGENT_TYPE_CLAUDE_CODE: return 'agents.typeClaudeCode'
    case AGENT_TYPE_HERMES:     return 'agents.typeHermes'
    case AGENT_TYPE_CURSOR:     return 'agents.typeCursor'
    case AGENT_TYPE_COPILOT:    return 'agents.typeCopilot'
    case AGENT_TYPE_GEMINI:     return 'agents.typeGemini'
    case AGENT_TYPE_CODEX:      return 'agents.typeCodex'
    case AGENT_TYPE_KIMI_CODE:  return 'agents.typeKimiCode'
    case AGENT_TYPE_DEVIN:      return 'agents.typeDevin'
    case AGENT_TYPE_AIDER:      return 'agents.typeAider'
    case AGENT_TYPE_CLINE:      return 'agents.typeCline'
    case AGENT_TYPE_ROO:        return 'agents.typeRoo'
    default:                    return 'agents.typeOther'
  }
}

/** Renders an agent public key as `{prefix}•••{suffix}`. */
export function formatPublicKey(
  agent: Pick<Agent, 'publicKeyPrefix' | 'publicKeySuffix'>,
): string {
  return `${agent.publicKeyPrefix}•••${agent.publicKeySuffix}`
}

/** Formats an ISO timestamp as a short, locale-aware date. */
export function formatAgentDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Formats an ISO timestamp as a short, locale-aware date + time. */
export function formatAgentDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
