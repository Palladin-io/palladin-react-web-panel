import { useVaultEncryptedAssetUrl } from '../assets/use-vault-encrypted-asset-url'
import { Icon } from '../../../shared/components/icon'
import { hexWithAlpha } from './vault-color'

export interface VaultIconCircleProps {
  vaultId: string
  /** Material Symbols Rounded glyph name. */
  icon: string
  /** Vault accent colour (hex). Used for both glyph and tinted background. */
  color: string
  /** Design-pixel diameter before the global comfortable-density scale. */
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
  vaultId,
  icon,
  color,
  size = 32,
  iconSize,
}: VaultIconCircleProps) {
  const assetId = icon.startsWith('vault-asset:') ? icon.slice('vault-asset:'.length) : null
  const asset = useVaultEncryptedAssetUrl(vaultId, assetId)
  const glyphSize = iconSize ?? Math.round(size * 0.55)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: `calc(${size}px * var(--cv-density-scale))`,
        height: `calc(${size}px * var(--cv-density-scale))`,
        backgroundColor: hexWithAlpha(color, 0.15),
        color,
      }}
    >
      {asset.url ? (
        <img src={asset.url} alt="" className="h-full w-full rounded-full object-contain" />
      ) : <Icon name={assetId ? 'shield' : icon.replace(/^builtin:/, '')} size={glyphSize} color={color} />}
    </span>
  )
}
