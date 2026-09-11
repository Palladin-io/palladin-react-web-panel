import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../auth'
import { Icon } from '../../shared/components/icon'
import {
  PERMISSION_ORGANIZATION_MANAGEMENT,
  PERMISSION_READ_API_KEY,
} from '../../shared/lib/permissions'

interface SettingsNavigationItem {
  id: string
  labelKey: string
  icon: string
  to:
    | '/settings/general'
    | '/settings/team'
    | '/settings/permissions'
    | '/settings/api-keys'
    | '/settings/billing'
    | '/settings/security'
    | '/settings/privacy'
    | '/settings/data-export'
  requiredPermission?: number
}

const ORGANIZATION_ITEMS: SettingsNavigationItem[] = [
  { id: 'general', labelKey: 'settings.navigation.general', icon: 'tune', to: '/settings/general' },
  { id: 'team', labelKey: 'settings.navigation.team', icon: 'group', to: '/settings/team' },
  { id: 'permissions', labelKey: 'settings.navigation.permissions', icon: 'admin_panel_settings', to: '/settings/permissions', requiredPermission: PERMISSION_ORGANIZATION_MANAGEMENT },
  { id: 'api-keys', labelKey: 'settings.navigation.apiKeys', icon: 'key', to: '/settings/api-keys', requiredPermission: PERMISSION_READ_API_KEY },
  { id: 'billing', labelKey: 'settings.navigation.billing', icon: 'credit_card', to: '/settings/billing' },
]

const ACCOUNT_ITEMS: SettingsNavigationItem[] = [
  { id: 'privacy', labelKey: 'privacy.title', icon: 'shield', to: '/settings/privacy' },
  { id: 'security', labelKey: 'settings.navigation.security', icon: 'security', to: '/settings/security' },
  { id: 'data-export', labelKey: 'settings.navigation.dataExport', icon: 'file_download', to: '/settings/data-export' },
]

export function SettingsLayout() {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const permissions = useAuthStore((state) => state.permissions)
  const visibleOrganizationItems = ORGANIZATION_ITEMS.filter(
    (item) => item.requiredPermission === undefined || (permissions & item.requiredPermission) !== 0,
  )
  const allItems = [...visibleOrganizationItems, ...ACCOUNT_ITEMS]

  return (
    <div className="flex h-full min-h-0 overflow-hidden text-[var(--cv-t1)]">
      <aside className="hidden w-[14rem] shrink-0 flex-col border-r border-[var(--cv-border)] lg:flex">
        <div className="flex h-[4.5rem] shrink-0 items-center px-4 pt-1">
          <div className="min-w-0">
            <h2 className="truncate text-heading font-bold">{t('settings.title')}</h2>
            <p className="truncate text-meta text-[var(--cv-t3)]">{t('settings.subtitle')}</p>
          </div>
        </div>
        <nav className="subtle-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label={t('settings.navigation.label')}>
          <SettingsNavigationGroup
            items={visibleOrganizationItems}
            pathname={pathname}
          />
          <SettingsNavigationGroup
            label={t('settings.navigation.account')}
            items={ACCOUNT_ITEMS}
            pathname={pathname}
          />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <nav
          className="subtle-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--cv-border)] px-3 py-2 lg:hidden"
          aria-label={t('settings.navigation.label')}
        >
          {allItems.map((item) => (
            <SettingsNavigationLink key={item.id} item={item} active={isActive(pathname, item.to)} compact />
          ))}
        </nav>
        <div className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function SettingsNavigationGroup({
  label,
  items,
  pathname,
}: {
  label?: string
  items: SettingsNavigationItem[]
  pathname: string
}) {
  return (
    <div className="mb-4">
      {label ? <p className="px-3 py-1.5 text-micro font-semibold text-[var(--cv-t3)]">{label}</p> : null}
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <SettingsNavigationLink key={item.id} item={item} active={isActive(pathname, item.to)} />
        ))}
      </div>
    </div>
  )
}

function SettingsNavigationLink({
  item,
  active,
  compact = false,
}: {
  item: SettingsNavigationItem
  active: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg text-ui font-medium transition-colors ${
        compact ? 'px-3 py-2' : 'px-3 py-2.5'
      } ${
        active
          ? 'bg-[rgb(var(--cv-primary-rgb)/0.1)] text-[var(--cv-primary)]'
          : 'text-[var(--cv-t2)] hover:bg-[var(--cv-list-item-hover)] hover:text-[var(--cv-t1)]'
      }`}
    >
      <Icon name={item.icon} size={16} />
      <span className="whitespace-nowrap">{t(item.labelKey)}</span>
    </Link>
  )
}

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}
