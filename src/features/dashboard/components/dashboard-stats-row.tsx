import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'

/**
 * Where a tile deep-links. Inbox tiles carry a `tab` so Pending lands on the
 * To-do segment and the grant-status tiles land on the Grants segment.
 */
type StatLink =
  | { to: '/vaults' | '/agents' | '/audit' }
  | { to: '/inbox'; search: { tab: 'todo' | 'grants' } }

export interface DashboardStatsRowProps {
  vaults: number
  entries: number
  agents: number
  pending: number
  /** Active/expired grant counts — omitted when the user lacks GrantManage. */
  active?: number
  expired?: number
  /** Omitted when the user lacks AuditView — no logs metric is shown then. */
  logs?: number
  /** Logs is a loaded-page count, not a true total; render it as "{n}+". */
  logsApprox?: boolean
}

type Stat = {
  key: string
  label: string
  value: number
  display: string
  /** Pending turns red once there's anything awaiting the user. */
  highlight?: boolean
} & StatLink

/**
 * Metric strip at the top of every dashboard state. Each tile links to its
 * detail view (label on the left, count on the right). Stats are ordered by
 * value descending (busiest first, on the left); they grow to fill a wide row
 * and scroll horizontally when they outgrow it. The page derives the counts.
 */
export function DashboardStatsRow({
  vaults,
  entries,
  agents,
  pending,
  active,
  expired,
  logs,
  logsApprox,
}: DashboardStatsRowProps) {
  const { t } = useTranslation()

  const stats: Stat[] = [
    { key: 'vaults', label: t('dashboard.statVaults'), value: vaults, display: String(vaults), to: '/vaults' },
    { key: 'entries', label: t('dashboard.statEntries'), value: entries, display: String(entries), to: '/vaults' },
    { key: 'agents', label: t('dashboard.statAgents'), value: agents, display: String(agents), to: '/agents' },
    {
      key: 'pending',
      label: t('dashboard.statPending'),
      value: pending,
      display: String(pending),
      to: '/inbox',
      search: { tab: 'todo' },
      highlight: pending > 0,
    },
  ]
  if (active !== undefined) {
    stats.push({
      key: 'active',
      label: t('dashboard.statActive'),
      value: active,
      display: String(active),
      to: '/inbox',
      search: { tab: 'grants' },
    })
  }
  if (expired !== undefined) {
    stats.push({
      key: 'expired',
      label: t('dashboard.statExpired'),
      value: expired,
      display: String(expired),
      to: '/inbox',
      search: { tab: 'grants' },
    })
  }
  if (logs !== undefined) {
    stats.push({
      key: 'logs',
      label: t('dashboard.statLogs'),
      value: logs,
      display: `${logs}${logsApprox ? '+' : ''}`,
      to: '/audit',
    })
  }

  const ordered = [...stats].sort((a, b) => b.value - a.value)

  return (
    <div className="mb-4 flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ordered.map((stat) => {
        const className = `${HOVERABLE_CARD_CLASSES} flex min-w-[9.375rem] flex-1 items-center justify-between gap-3 px-4 py-3`
        const content = (
          <>
            <span className="text-meta font-medium text-[var(--cv-t3)]">
              {stat.label}
            </span>
            <span
              className={`text-2xl font-bold ${
                stat.highlight ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t1)]'
              }`}
            >
              {stat.display}
            </span>
          </>
        )
        return stat.to === '/inbox' ? (
          <Link key={stat.key} to="/inbox" search={stat.search} className={className}>
            {content}
          </Link>
        ) : (
          <Link key={stat.key} to={stat.to} className={className}>
            {content}
          </Link>
        )
      })}
    </div>
  )
}
