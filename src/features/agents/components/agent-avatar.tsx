import { Icon } from '../../../shared/components/icon'
import type { Agent } from '../api/agents-api'
import {
  agentAvatarColor,
  agentInitials,
  isCustomAgentIcon,
} from './agent-presentation'

export interface AgentAvatarProps {
  agent: Pick<Agent, 'name' | 'agentId' | 'iconKey'>
  /** Design-pixel diameter before the global comfortable-density scale. */
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
  if (isCustomAgentIcon(agent.iconKey)) {
    content = (
      <img
        src={agent.iconKey}
        alt=""
        className="h-full w-full rounded-full object-cover"
      />
    )
  } else if (agent.iconKey) {
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
        width: `calc(${size}px * var(--cv-density-scale))`,
        height: `calc(${size}px * var(--cv-density-scale))`,
        backgroundColor: hexWithAlpha(color, 0.15),
        color,
        fontSize: `calc(${Math.round(size * 0.38)}px * var(--cv-density-scale))`,
      }}
    >
      {content}
    </span>
  )
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    // Non-hex (CSS var / named colour) — color-mix so alpha is honoured
    // instead of rendering fully opaque. Mirrors shared vault-color helper.
    return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
