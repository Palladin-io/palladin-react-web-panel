import type { CSSProperties, HTMLAttributes } from 'react'
import { METADATA_BADGE_CLASSES } from '../lib/styles'

interface MetadataBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic CSS token; omit for descriptive metadata. */
  color?: string
}

export function MetadataBadge({ color, className = '', style, ...props }: MetadataBadgeProps) {
  return <span {...props} className={`${METADATA_BADGE_CLASSES} ${className}`}
    style={{ ...style, ...(color ? { '--cv-badge-color': color } : {}) } as CSSProperties} />
}
