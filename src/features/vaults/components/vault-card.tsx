import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import type { VaultSummary } from '../types'
import { VaultIconCircle } from './vault-icon-circle'
import { DEFAULT_VAULT_COLOR, DEFAULT_VAULT_ICON } from './vault-presentation'

export interface VaultCardProps {
  vault: VaultSummary
  onClick: () => void
}

/**
 * Card representation of a vault in the list view. Two-zone layout:
 * a top row with the icon, name, entry count, and a right-aligned
 * grants summary, then a divider and a footer row with a lock glyph
 * and an "updated X ago" timestamp.
 *
 * Pure presentational — no data fetching, no mutations. The parent
 * owns navigation via `onClick` so the card can be reused in different
 * contexts (search results, picker dialogs) without coupling it to a
 * route. Styling mirrors `docs/design/astro/.../VaultCard.astro` 1:1.
 */
export function VaultCard({ vault, onClick }: VaultCardProps) {
  const { t, i18n } = useTranslation()
  const updated = formatRelativeUpdate(vault.updatedAt, i18n.language, t)
  const accent = vault.color ?? DEFAULT_VAULT_COLOR
  const icon = vault.icon ?? DEFAULT_VAULT_ICON

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-[280px] flex-1 flex-col items-stretch rounded-2xl border
        border-[rgba(253,249,228,0.08)] bg-[rgba(13,27,62,0.6)] p-4 text-left
        shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-colors
        hover:border-[rgba(255,79,79,0.3)] focus:outline-none
        focus-visible:border-[#FF4F4F]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VaultIconCircle icon={icon} color={accent} size={32} iconSize={16} />
          <div className="flex flex-col gap-0.5 text-left">
            <span className="text-[13px] font-bold text-[#FDF9E4]">
              {vault.name}
            </span>
            <span className="text-[11px] text-[#8A95A6]">
              {t('vault.entries', { count: vault.entryCount })}
            </span>
          </div>
        </div>
        <span className="text-[11px] text-[#8A95A6]">
          {t('vault.grants', { count: vault.activeGrantCount })}
        </span>
      </div>

      <div
        aria-hidden
        className="my-2 h-px w-full bg-[rgba(138,149,166,0.12)]"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon name="lock" size={13} color="#8A95A6" />
          <span className="text-[11px] text-[#8A95A6]">
            {t('vault.grants', { count: vault.activeGrantCount })}
          </span>
        </div>
        {updated ? (
          <span className="text-[11px] text-[#8A95A6]">
            {t('vault.relativeUpdatedLabel', { time: updated })}
          </span>
        ) : null}
      </div>
    </button>
  )
}

/**
 * Lightweight relative time formatter — avoids pulling in a date library
 * for what's essentially "x days ago". Falls back to an absolute date for
 * anything older than a month. Buckets translate via i18n plural keys so
 * Polish/English (and future locales) read naturally.
 */
function formatRelativeUpdate(
  iso: string,
  locale: string,
  t: TFunction,
): string | null {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null

  const diffMs = Date.now() - ts
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return t('vault.relativeJustNow')
  if (minutes < 60) return t('vault.relativeMinutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('vault.relativeHoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 30) return t('vault.relativeDaysAgo', { count: days })
  return new Date(ts).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
