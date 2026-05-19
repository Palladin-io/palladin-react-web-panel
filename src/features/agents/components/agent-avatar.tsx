import { Icon } from '../../../shared/components/icon'
import type { Agent } from '../api/agents-api'
import { agentAvatarColor, agentInitials } from './agent-presentation'

export interface AgentAvatarProps {
  agent: Pick<Agent, 'name' | 'agentId'>
  /** Outer diameter in pixels. */
  size?: number
}

/**
 * Coloured initials circle identifying an agent across the list and
 * detail views. Falls back to the `smart_toy` glyph for unnamed agents.
 * The tint is deterministic — see {@link agentAvatarColor}.
 */
export function AgentAvatar({ agent, size = 32 }: AgentAvatarProps) {
  const color = agentAvatarColor(agent)
  const initials = agentInitials(agent.name)

  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        backgroundColor: hexWithAlpha(color, 0.15),
        color,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initials || <Icon name="smart_toy" size={Math.round(size * 0.55)} color={color} />}
    </span>
  )
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
