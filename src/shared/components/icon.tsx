import type { CSSProperties } from 'react'

export interface IconProps {
  /** Material Symbols Rounded glyph name (e.g. `shield`, `arrow_back`). */
  name: string
  /** Pixel size of the glyph. Defaults to 18 to match the Astro design defaults. */
  size?: number
  /** Optional inline colour — falls back to `currentColor`. */
  color?: string
  className?: string
  /** Decorative icons should pass `aria-hidden`; meaningful ones need a label upstream. */
  ariaHidden?: boolean
  style?: CSSProperties
}

/**
 * Single inline-glyph component used across the vault screens. Wraps the
 * Material Symbols Rounded webfont so component code reads as
 * `<Icon name="arrow_back" />` instead of leaking the `mi` class string
 * everywhere. Mirrors the Astro design system's `<span class="mi">…`
 * pattern so the React panel stays visually consistent with the
 * prototypes in `../design/astro/`.
 */
export function Icon({
  name,
  size = 18,
  color,
  className,
  ariaHidden = true,
  style,
}: IconProps) {
  return (
    <span
      aria-hidden={ariaHidden || undefined}
      className={`mi${className ? ` ${className}` : ''}`}
      style={{ fontSize: size, color, ...style }}
    >
      {name}
    </span>
  )
}
