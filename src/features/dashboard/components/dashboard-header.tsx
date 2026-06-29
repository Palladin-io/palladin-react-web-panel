import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'

export interface DashboardHeaderProps {
  /** First name for the greeting; falls back to a generic greeting when absent. */
  firstName?: string
}

/**
 * Dashboard top row: greeting + date on the left, an inline search bar on the
 * right (mirrors DashboardMain.astro). The search is presentational for now —
 * there is no global-search route yet, so it is a controlled input wired to
 * local state with a TODO. The visual must exist regardless.
 */
export function DashboardHeader({ firstName }: DashboardHeaderProps) {
  const { t } = useTranslation()
  // TODO: wire to a global search route once cross-resource search lands.
  const [query, setQuery] = useState('')

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <header className="mb-4 flex items-center gap-4">
      <div className="shrink-0">
        <h1 className="text-xl font-bold text-[var(--cv-t1)]">
          {firstName
            ? t('dashboard.greeting', { name: firstName })
            : t('dashboard.greetingGeneric')}
        </h1>
        <p className="text-xs text-[var(--cv-t3)]">{today}</p>
      </div>

      <label className="flex flex-1 items-center gap-2.5 rounded-xl bg-[var(--cv-card-bg)] px-4 py-2.5 shadow-sm">
        <Icon name="search" size={18} color="var(--cv-t3)" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dashboard.searchPlaceholder')}
          className="flex-1 border-none bg-transparent text-xs text-[var(--cv-t1)] outline-none placeholder:text-[var(--cv-t3)]"
        />
      </label>
    </header>
  )
}
