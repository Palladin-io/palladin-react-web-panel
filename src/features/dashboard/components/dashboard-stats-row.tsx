import { useTranslation } from 'react-i18next'

export interface DashboardStatsRowProps {
  vaults: number
  entries: number
  agents: number
  pending: number
}

interface Stat {
  label: string
  value: number
  /** Pending turns red once there's anything awaiting the user. */
  highlight?: boolean
}

/**
 * Four-card metric strip rendered at the top of every dashboard state.
 * Purely presentational — the page derives the counts from its queries
 * and passes them down, keeping this component free of data concerns.
 */
export function DashboardStatsRow({
  vaults,
  entries,
  agents,
  pending,
}: DashboardStatsRowProps) {
  const { t } = useTranslation()

  const stats: Stat[] = [
    { label: t('dashboard.statVaults'), value: vaults },
    { label: t('dashboard.statEntries'), value: entries },
    { label: t('dashboard.statAgents'), value: agents },
    { label: t('dashboard.statPending'), value: pending, highlight: pending > 0 },
  ]

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-1 items-center gap-3 rounded-xl bg-[var(--cv-card-bg)] px-4 py-3.5 shadow-sm"
        >
          <span
            className={`text-2xl font-bold ${
              stat.highlight ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t1)]'
            }`}
          >
            {stat.value}
          </span>
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--cv-t3)]">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  )
}
