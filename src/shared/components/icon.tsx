import type { CSSProperties } from 'react'
import { CircleHelp } from 'lucide-react'
import { ICON_GLYPHS } from './icon-glyphs'

export interface IconProps {
  /** Stable icon name mapped to a bundled Lucide SVG (e.g. `shield`, `arrow_back`). */
  name: string
  /** Design-pixel size before the global comfortable-density scale is applied. */
  size?: number
  /** Optional inline colour — falls back to `currentColor`. */
  color?: string
  className?: string
  /** Decorative icons should pass `aria-hidden`; meaningful ones need a label upstream. */
  ariaHidden?: boolean
  style?: CSSProperties
}

/** Local SVG renderer. Unknown stored names get a visible, font-independent fallback. */
export function Icon({
  name,
  size = 18,
  color,
  className,
  ariaHidden = true,
  style,
}: IconProps) {
  const Glyph = Object.hasOwn(ICON_GLYPHS, name) ? ICON_GLYPHS[name] : CircleHelp
  const dimension = `calc(${size}px * var(--cv-density-scale, 1))`
  return (
    <Glyph
      aria-hidden={ariaHidden || undefined}
      focusable="false"
      data-icon={name}
      className={`inline-block shrink-0 align-middle${className ? ` ${className}` : ''}`}
      style={{ width: dimension, height: dimension, color, ...style }}
    />
  )
}
