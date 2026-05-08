import { Icon } from '../../../shared/components/icon'
import { hexWithAlpha } from './vault-color'

export interface VaultIconCircleProps {
  /** Material Symbols Rounded glyph name. */
  icon: string
  /** Vault accent colour (hex). Used for both glyph and tinted background. */
  color: string
  /** Outer diameter in pixels. */
  size?: number
  /** Inner glyph font size. Defaults to ~55 % of the diameter. */
  iconSize?: number
}

/**
 * Coloured circle used as the visual identity of a vault — appears on
 * cards, in detail headers, and inside dialog rows. Centralised here so
 * the tint formula (icon colour + 12 % alpha background) stays
 * consistent everywhere a vault is rendered.
 */
export function VaultIconCircle({
  icon,
  color,
  size = 32,
  iconSize,
}: VaultIconCircleProps) {
  const glyphSize = iconSize ?? Math.round(size * 0.55)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: hexWithAlpha(color, 0.15),
        color,
      }}
    >
      <Icon name={icon} size={glyphSize} color={color} />
    </span>
  )
}
