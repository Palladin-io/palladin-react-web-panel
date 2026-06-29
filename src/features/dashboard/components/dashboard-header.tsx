import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchBar } from '../../../shared/components/search-bar'

export interface DashboardHeaderProps {
  /** First name for the greeting; falls back to a generic greeting when absent. */
  firstName?: string
}

/**
 * Dashboard top row: greeting + date on the left, the shared search bar filling
 * the rest (mirrors the list-screen header scale). The search is presentational
 * for now — there is no global-search route yet, so it is a controlled input
 * wired to local state with a TODO. The visual must exist regardless.
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
    <header className="mb-4 flex h-10 items-center gap-4">
      <div className="shrink-0">
        <h1 className="text-[14px] font-bold text-[var(--cv-t1)]">
          {firstName
            ? t('dashboard.greeting', { name: firstName })
            : t('dashboard.greetingGeneric')}
        </h1>
        <p className="text-[11px] text-[var(--cv-t3)]">{today}</p>
      </div>

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={t('dashboard.searchPlaceholder')}
        className="flex-1"
      />
    </header>
  )
}
