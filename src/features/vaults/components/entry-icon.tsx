import { useState, useSyncExternalStore } from 'react'
import { Icon } from '../../../shared/components/icon'
import type { EntryType } from '../types'
import {
  ENTRY_ICON_COLORS,
  isCustomIconUrl,
  presentationForType,
} from './entry-presentation'
import { hexWithAlpha } from './vault-color'
import {
  cachedPublicAsset,
  cachedWebsiteAsset,
  publicAssetCacheRevision,
  subscribePublicAssetCache,
} from '../../../shared/api/public-assets-api'

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
 * the backend cached on `Entry.Icon` (CVT-237).
 */
export function EntryIcon({ icon, type, color, className }: EntryIconProps) {
  const [failed, setFailed] = useState(false)
  // The catalog cache lives outside React. Subscribe here instead of relying
  // on an ancestor rerender; this also updates memoized rows when a background
  // resolve finishes after the row was mounted.
  useSyncExternalStore(subscribePublicAssetCache, publicAssetCacheRevision, publicAssetCacheRevision)
  const presentation = presentationForType(type)
  const publicAssetId = icon?.startsWith('public-asset:') ? icon.slice('public-asset:'.length) : null
  const websiteHostname = icon?.startsWith('website:') ? icon.slice('website:'.length) : null
  const builtin = icon?.startsWith('builtin:') ? icon.slice('builtin:'.length) : icon
  const catalogAsset = publicAssetId
    ? cachedPublicAsset(publicAssetId)
    : websiteHostname ? cachedWebsiteAsset(websiteHostname) : undefined
  const value = (catalogAsset?.url ?? (websiteHostname ? undefined : builtin)) ?? presentation.defaultIcon
  // Arbitrary remote URLs stored in an encrypted entry remain forbidden. A URL
  // returned by the validated public catalog is trusted by provenance, while a
  // blob URL is a locally decrypted image.
  const isUrl = catalogAsset !== undefined || isCustomIconUrl(value)
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
          onError={() => setFailed(true)}
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
