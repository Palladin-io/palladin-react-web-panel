import { ENTITY_ICON_FRAME_CLASSES, ENTITY_ICON_IMAGE_CLASSES } from '../../../shared/lib/styles'
import { useVaultEncryptedAssetUrl } from '../assets/use-vault-encrypted-asset-url'
import { Icon } from '../../../shared/components/icon'

export interface VaultIconCircleProps {
  vaultId: string
  /** Material Symbols Rounded glyph name. */
  icon: string
  /** Vault accent colour (hex). Used for the glyph; the frame stays neutral. */
  color: string
  /** Design-pixel size before the global comfortable-density scale. */
  size?: number
  /** Inner glyph font size. Defaults to 50 % of the diameter. */
  iconSize?: number
}

/**
 * Outlined badge used as the visual identity of a vault — appears on
 * cards, in detail headers, and inside dialog rows. Centralised here so
 * the neutral frame and chosen glyph colour stay consistent everywhere.
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
  const glyphSize = iconSize ?? Math.round(size * 0.5)
  return (
    <span
      aria-hidden
      className={ENTITY_ICON_FRAME_CLASSES}
      style={{
        width: `calc(${size}px * var(--cv-density-scale))`,
        height: `calc(${size}px * var(--cv-density-scale))`,
        backgroundColor: 'transparent',
        color,
      }}
    >
      {asset.url ? (
        <img src={asset.url} alt="" className={ENTITY_ICON_IMAGE_CLASSES} />
      ) : <Icon name={assetId ? 'shield' : icon.replace(/^builtin:/, '')} size={glyphSize} color={color} />}
    </span>
  )
}
