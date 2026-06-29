import { useTranslation } from 'react-i18next'

export interface DashboardStatsRowProps {
  vaults: number
  entries: number
  agents: number
  pending: number
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
  /** Pending turns red once there's anything awaiting the user. */
  highlight?: boolean
}

/**
 * Metric strip at the top of every dashboard state. Stats are ordered by value
 * descending (busiest first, on the left) and scroll horizontally when they
 * outgrow the row. Purely presentational — the page derives the counts.
 */
export function DashboardStatsRow({
  vaults,
  entries,
  agents,
  pending,
  logs,
  logsApprox,
}: DashboardStatsRowProps) {
  const { t } = useTranslation()

  const stats: Stat[] = [
    { key: 'vaults', label: t('dashboard.statVaults'), value: vaults, display: String(vaults) },
    { key: 'entries', label: t('dashboard.statEntries'), value: entries, display: String(entries) },
    { key: 'agents', label: t('dashboard.statAgents'), value: agents, display: String(agents) },
    {
      key: 'pending',
      label: t('dashboard.statPending'),
      value: pending,
      display: String(pending),
      highlight: pending > 0,
    },
  ]
  if (logs !== undefined) {
    stats.push({
      key: 'logs',
      label: t('dashboard.statLogs'),
      value: logs,
      display: `${logs}${logsApprox ? '+' : ''}`,
    })
  }

  const ordered = [...stats].sort((a, b) => b.value - a.value)

  return (
    <div className="mb-4 flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {ordered.map((stat) => (
        <div
          key={stat.key}
          className="flex min-w-[128px] shrink-0 items-center gap-3 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-4 py-3"
        >
          <span
            className={`text-2xl font-bold ${
              stat.highlight ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t1)]'
            }`}
          >
            {stat.display}
          </span>
          <span className="text-xs font-medium text-[var(--cv-t3)]">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  )
}
