import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { GlobalSearchAutocomplete } from '../features/search'
import { Icon } from '../shared/components/icon'

export function AppNavbar({ displayName }: { displayName?: string }) {
  const { t } = useTranslation()
  return <header className="app-navbar">
    <span className="app-navbar-welcome min-w-0 truncate text-meta font-medium text-[var(--cv-t2)]">{displayName ? t('nav.welcomeNamed', { name: displayName.split(' ')[0] }) : t('dashboard.greetingGeneric')}</span>
    <GlobalSearchAutocomplete className="app-navbar-search" placeholder={t('dashboard.searchPlaceholder')} />
    <Link to="/inbox" aria-label={t('nav.inbox')} className="flex h-action w-action shrink-0 items-center justify-center rounded-lg text-[var(--cv-t2)] hover:bg-[var(--cv-btn-ghost-hover)]">
      <Icon name="notifications" size={18} />
    </Link>
  </header>
}
