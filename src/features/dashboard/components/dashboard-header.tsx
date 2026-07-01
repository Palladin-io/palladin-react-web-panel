import { useTranslation } from 'react-i18next'
import { GlobalSearchAutocomplete } from '../../search'

export interface DashboardHeaderProps {
  /** First name for the greeting; falls back to a generic greeting when absent. */
  firstName?: string
}

/**
 * Dashboard top row: greeting + date on the left, the global-search autocomplete
 * filling the rest (mirrors the list-screen header scale). Selecting a hit jumps
 * straight to the matching agent/vault detail screen.
 */
export function DashboardHeader({ firstName }: DashboardHeaderProps) {
  const { t } = useTranslation()

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

      <GlobalSearchAutocomplete
        placeholder={t('dashboard.searchPlaceholder')}
        className="flex-1"
      />
    </header>
  )
}
