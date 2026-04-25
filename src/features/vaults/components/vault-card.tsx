import { useTranslation } from 'react-i18next'
import { GRANT_MODE_FULL, type VaultSummary } from '../types'

const DEFAULT_ACCENT = '#2EC4B6'
const DEFAULT_ICON = '🔒'

export interface VaultCardProps {
  vault: VaultSummary
  onClick: () => void
}

/**
 * Single vault tile rendered inside the dashboard grid. Pure presentational
 * component — no data fetching, no mutations. The parent owns navigation
 * via `onClick` so this card can be reused in different contexts (search
 * results, picker dialogs) without coupling it to a route.
 */
export function VaultCard({ vault, onClick }: VaultCardProps) {
  const { t, i18n } = useTranslation()
  const accent = vault.color ?? DEFAULT_ACCENT
  const isFull = vault.grantMode === GRANT_MODE_FULL
  const updated = formatRelativeUpdate(vault.updatedAt, i18n.language)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-stretch gap-4 rounded-2xl border border-[rgba(253,249,228,0.08)]
        bg-[#1A2A4A] p-5 text-left transition-colors hover:border-[rgba(46,196,182,0.4)]
        focus:outline-none focus-visible:border-[#2EC4B6]"
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
          style={{
            backgroundColor: `${accent}1F`, // ~12% opacity tint
            color: accent,
          }}
          aria-hidden
        >
          {vault.icon ?? DEFAULT_ICON}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#FDF9E4]">
            {vault.name}
          </h3>
          {vault.description ? (
            <p className="mt-0.5 truncate text-[12px] text-[#6B7A8E]">
              {vault.description}
            </p>
          ) : null}
        </div>
        <ModeBadge isFull={isFull} t={t} />
      </div>

      <div className="flex items-center justify-between text-[11px] text-[#6B7A8E]">
        <div className="flex items-center gap-3">
          <span>{t('vault.entries', { count: vault.entryCount })}</span>
          <span aria-hidden className="text-[rgba(253,249,228,0.18)]">·</span>
          <span>{t('vault.grants', { count: vault.activeGrantCount })}</span>
        </div>
        {updated ? <span>{updated}</span> : null}
      </div>
    </button>
  )
}

interface ModeBadgeProps {
  isFull: boolean
  t: ReturnType<typeof useTranslation>['t']
}

function ModeBadge({ isFull, t }: ModeBadgeProps) {
  const color = isFull ? '#F59E0B' : '#2EC4B6'
  const label = isFull ? t('vault.modeFull') : t('vault.modeGranular')
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
      style={{
        borderColor: `${color}66`,
        color,
        backgroundColor: `${color}1F`,
      }}
    >
      {label}
    </span>
  )
}

/**
 * Lightweight relative time formatter — avoids pulling in a date library
 * for what's essentially "x days ago". Falls back to an absolute date for
 * anything older than a month.
 */
function formatRelativeUpdate(iso: string, locale: string): string | null {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return null

  const diffMs = Date.now() - ts
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
