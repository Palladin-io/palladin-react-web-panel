import type { Agent } from '../api/agents-api'

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
