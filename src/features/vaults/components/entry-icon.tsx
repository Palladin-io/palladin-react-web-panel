import { useState } from 'react'
import { Icon } from '../../../shared/components/icon'
import type { EntryType } from '../types'
import {
  ENTRY_ICON_COLORS,
  isCustomIconUrl,
  presentationForType,
} from './entry-presentation'
import { hexWithAlpha } from './vault-color'
import { trustedPublicAssetUrl } from '../../../shared/api/public-assets-api'
import { parsePublicAssetIconReference } from '../../../shared/crypto/vault-plaintext'

export interface EntryIconProps {
  /** Raw icon from the entry — a Material glyph name, or a favicon/blob URL. */
  icon: string | null | undefined
  type: EntryType
  /** Explicit colour override (entry.color); otherwise derived from glyph/type. */
  color?: string | null
  /** Container classes — defaults to the 32px circular badge used in lists. */
  className?: string
}

/**
 * Circular entry avatar. Renders a favicon/blob URL as an `<img>` and falls back
 * to the entry type's Material glyph if the URL fails to load (e.g. a cached
 * favicon 404s) — never a broken image. Shared by the entries list, the entry
 * detail panel, and the dashboard "recent" cards so favicon handling stays in
 * one place. The client never fetches favicons itself; it only renders the URL
 * stored inside the encrypted Entry presentation data.
 */
export function EntryIcon({ icon, type, color, className }: EntryIconProps) {
  const [failedValue, setFailedValue] = useState<string | null>(null)
  const presentation = presentationForType(type)
  const publicAsset = parsePublicAssetIconReference(icon)
  const publicAssetUrl = publicAsset ? trustedPublicAssetUrl(publicAsset.url) : null
  const builtin = icon?.startsWith('builtin:') ? icon.slice('builtin:'.length) : icon
  const value = publicAssetUrl ?? builtin ?? presentation.defaultIcon
  const isUrl = publicAssetUrl !== null || isCustomIconUrl(value)
  const failed = failedValue === value
  const safeGlyph = !isUrl && value.includes(':') ? presentation.defaultIcon : value
  const glyphColor =
    color ??
    (!isUrl ? (ENTRY_ICON_COLORS[safeGlyph] ?? presentation.iconColor) : presentation.iconColor)

  return (
    <span
      aria-hidden
      className={
        className ??
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full'
      }
      style={{ backgroundColor: hexWithAlpha(glyphColor, 0.12), color: glyphColor }}
    >
      {isUrl && !failed ? (
        <img
          src={value}
          alt=""
          onError={() => setFailedValue(value)}
          className="h-5 w-5 rounded-full object-cover"
        />
      ) : (
        <Icon
          name={isUrl ? presentation.defaultIcon : safeGlyph}
          size={16}
          color={glyphColor}
        />
      )}
    </span>
  )
}
