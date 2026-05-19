import { Icon } from '../../../shared/components/icon'
import type { Agent } from '../api/agents-api'
import { agentAvatarColor, agentInitials } from './agent-presentation'

export interface AgentAvatarProps {
  agent: Pick<Agent, 'name' | 'agentId' | 'iconKey'>
  /** Outer diameter in pixels. */
  size?: number
}

/**
 * Coloured circle identifying an agent across the list and detail
 * views. Renders the agent's chosen Material icon when `iconKey` is
 * set, otherwise falls back to initials or the `smart_toy` glyph for
 * unnamed agents. The tint is deterministic — see {@link agentAvatarColor}.
 */
export function AgentAvatar({ agent, size = 32 }: AgentAvatarProps) {
  const color = agentAvatarColor(agent)
  const initials = agentInitials(agent.name)
  const glyphSize = Math.round(size * 0.55)

  let content
  if (agent.iconKey) {
    content = <Icon name={agent.iconKey} size={glyphSize} color={color} />
  } else if (initials) {
    content = initials
  } else {
    content = <Icon name="smart_toy" size={glyphSize} color={color} />
  }

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
      {content}
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
