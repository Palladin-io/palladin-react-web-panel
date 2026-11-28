import { useState, useSyncExternalStore } from 'react'
import { ENTITY_ICON_FRAME_CLASSES, ENTITY_ICON_IMAGE_CLASSES } from '../../../shared/lib/styles'
import { Icon } from '../../../shared/components/icon'
import type { Agent } from '../api/agents-api'
import {
  agentAvatarColor,
  agentGlyphColor,
  agentInitials,
  isCustomAgentIcon,
} from './agent-presentation'
import {
  cachedPublicAsset,
  publicAssetCacheRevision,
  subscribePublicAssetCache,
} from '../../../shared/api/public-assets-api'

export interface AgentAvatarProps {
  agent: Pick<Agent, 'name' | 'agentId' | 'iconKey'> & { iconColor?: string | null }
  /** Design-pixel size before the global comfortable-density scale. */
  size?: number
}

/**
 * Agent identity badge with the cross-client precedence: uploaded image, then
 * the chosen glyph in its colour, then initials tinted from the stable agent id.
 */
export function AgentAvatar({ agent, size = 32 }: AgentAvatarProps) {
  useSyncExternalStore(subscribePublicAssetCache, publicAssetCacheRevision)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const glyphSize = Math.round(size * 0.5)
  const iconKey = agent.iconKey ?? null

  const imageSource = isCustomAgentIcon(iconKey)
    ? iconKey.startsWith('public-asset:')
      ? cachedPublicAsset(iconKey.slice('public-asset:'.length))?.url
      : iconKey
    : undefined
  const showImage = imageSource != null && imageSource !== failedSource
  const glyph = iconKey && !iconKey.includes(':') ? iconKey : null
  const initials = agentInitials(agent.name)
  const color = glyph ? agentGlyphColor(glyph, agent.iconColor) : agentAvatarColor(agent.agentId)

  let content
  if (showImage) {
    content = (
      <img
        src={imageSource}
        alt=""
        onError={() => setFailedSource(imageSource)}
        className={ENTITY_ICON_IMAGE_CLASSES}
      />
    )
  } else if (glyph) {
    content = <Icon name={glyph} size={glyphSize} color={color} />
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
        backgroundColor: 'var(--cv-card-bg)',
        borderWidth: '1.5px',
        ...(showImage ? {} : { borderColor: color }),
        color,
        fontSize: `calc(${Math.round(size * 0.38)}px * var(--cv-density-scale))`,
      }}
    >
      {content}
    </span>
  )
}

