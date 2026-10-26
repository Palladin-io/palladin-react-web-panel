import { ENTITY_ICON_FRAME_CLASSES, ENTITY_ICON_IMAGE_CLASSES } from '../../../shared/lib/styles'
import { Icon } from '../../../shared/components/icon'
import type { Agent } from '../api/agents-api'
import {
  agentAvatarColor,
  agentInitials,
  isCustomAgentIcon,
} from './agent-presentation'
import { cachedPublicAsset } from '../../../shared/api/public-assets-api'

export interface AgentAvatarProps {
  agent: Pick<Agent, 'name' | 'agentId' | 'iconKey'>
  /** Design-pixel size before the global comfortable-density scale. */
  size?: number
}

/**
 * Outlined badge identifying an agent across the list and detail
 * views. Renders the agent's chosen Material icon when `iconKey` is
 * set, otherwise falls back to initials or the `smart_toy` glyph for
 * unnamed agents. The tint is deterministic — see {@link agentAvatarColor}.
 */
export function AgentAvatar({ agent, size = 32 }: AgentAvatarProps) {
  const color = agentAvatarColor(agent)
  const initials = agentInitials(agent.name)
  const glyphSize = Math.round(size * 0.5)

  let content
  if (isCustomAgentIcon(agent.iconKey)) {
    const source = agent.iconKey?.startsWith('public-asset:')
      ? cachedPublicAsset(agent.iconKey.slice('public-asset:'.length))?.url
      : agent.iconKey
    if (!source) {
      content = initials || <Icon name="smart_toy" size={glyphSize} color={color} />
    } else {
    content = (
      <img
        src={source}
        alt=""
        className={ENTITY_ICON_IMAGE_CLASSES}
      />
    )
    }
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
      className={`${ENTITY_ICON_FRAME_CLASSES} font-bold`}
      style={{
        width: `calc(${size}px * var(--cv-density-scale))`,
        height: `calc(${size}px * var(--cv-density-scale))`,
        backgroundColor: isCustomAgentIcon(agent.iconKey) ? 'transparent' : hexWithAlpha(color, 0.12),
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
