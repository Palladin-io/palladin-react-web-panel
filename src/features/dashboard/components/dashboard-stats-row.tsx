import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'

/** Routes a stat tile can deep-link to. */
type StatRoute = '/vaults' | '/agents' | '/inbox' | '/audit'

export interface DashboardStatsRowProps {
  vaults: number
  entries: number
  agents: number
  pending: number
  /** Omitted when the user lacks GrantManage — no grants metric is shown then. */
  grants?: number
  /** Grants is a loaded-page count, not a true total; render it as "{n}+". */
  grantsApprox?: boolean
  /** Omitted when the user lacks AuditView — no logs metric is shown then. */
  logs?: number
  /** Logs is a loaded-page count, not a true total; render it as "{n}+". */
  logsApprox?: boolean
}

interface Stat {
  key: string
  label: string
  value: number
  display: string
  to: StatRoute
  /** Pending turns red once there's anything awaiting the user. */
  highlight?: boolean
}

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
  grants,
  grantsApprox,
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
      highlight: pending > 0,
    },
  ]
  if (grants !== undefined) {
    stats.push({
      key: 'grants',
      label: t('dashboard.statGrants'),
      value: grants,
      display: `${grants}${grantsApprox ? '+' : ''}`,
      to: '/inbox',
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
      {ordered.map((stat) => (
        <Link
          key={stat.key}
          to={stat.to}
          className={`${HOVERABLE_CARD_CLASSES} flex min-w-[150px] flex-1 items-center justify-between gap-3 px-4 py-3`}
        >
          <span className="text-xs font-medium text-[var(--cv-t3)]">
            {stat.label}
          </span>
          <span
            className={`text-2xl font-bold ${
              stat.highlight ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t1)]'
            }`}
          >
            {stat.display}
          </span>
        </Link>
      ))}
    </div>
  )
}
