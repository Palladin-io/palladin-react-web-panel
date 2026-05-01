import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../features/auth'
import { Icon } from '../shared/components/icon'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { accessToken, isOnboarded, isVaultLocked } = useAuthStore.getState()
    if (!accessToken) {
      throw redirect({ to: '/login' })
    }
    // Onboarded users with a locked vault must pass through /unlock before
    // they can access any other authenticated screen. Users who haven't
    // onboarded yet get routed by `/_authenticated/` into the wizard.
    if (isOnboarded && isVaultLocked && location.pathname !== '/unlock') {
      throw redirect({ to: '/unlock' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // The unlock screen is intentionally chrome-less — sidebar would let
  // the user click into screens they aren't allowed to see yet.
  if (pathname === '/unlock') return <Outlet />
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar currentPath={pathname} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

interface NavItem {
  key: string
  labelKey: string
  icon: string
  to?: string
  matchPrefix?: string
  disabled?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'vaults',
    labelKey: 'nav.vaults',
    icon: 'shield',
    to: '/vaults',
    matchPrefix: '/vaults',
  },
  { key: 'agents', labelKey: 'nav.agents', icon: 'smart_toy', disabled: true },
  { key: 'audit', labelKey: 'nav.auditLog', icon: 'history', disabled: true },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    icon: 'settings',
    disabled: true,
  },
]

interface AppSidebarProps {
  currentPath: string
}

function AppSidebar({ currentPath }: AppSidebarProps) {
  const { t } = useTranslation()
  return (
    <aside
      className="flex h-full w-[220px] flex-shrink-0 flex-col border-r
        border-[rgba(253,249,228,0.07)] bg-[rgba(13,27,62,0.95)]"
    >
      <div className="flex items-center gap-2 px-5 py-5">
        <Icon name="shield_lock" size={20} color="#FF4F4F" />
        <span className="text-[15px] font-semibold tracking-wide text-[#FDF9E4]">
          Claw Vault
        </span>
      </div>
      <nav className="flex flex-col">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            label={t(item.labelKey)}
            comingSoonLabel={t('nav.comingSoon')}
            currentPath={currentPath}
          />
        ))}
      </nav>
      <div className="mt-auto px-5 py-4 text-[10px] uppercase tracking-wider text-[#5A6478]">
        Claw Vault · Beta
      </div>
    </aside>
  )
}

interface SidebarLinkProps {
  item: NavItem
  label: string
  comingSoonLabel: string
  currentPath: string
}

/**
 * Renders an active or disabled nav row. Active state is driven by the
 * route prefix (so `/vaults/abc` still highlights "Vaults"). Disabled
 * items render as a non-interactive div with a tooltip — using a button
 * would let keyboard users tab into a dead control.
 */
function SidebarLink({
  item,
  label,
  comingSoonLabel,
  currentPath,
}: SidebarLinkProps) {
  const isActive = item.matchPrefix
    ? currentPath === item.matchPrefix ||
      currentPath.startsWith(`${item.matchPrefix}/`)
    : false

  const baseRow =
    'relative flex items-center gap-3 px-4 py-3 text-[13px] font-medium transition-colors'

  if (item.disabled || !item.to) {
    return (
      <div
        className={`${baseRow} text-[#5A6478]`}
        style={{ cursor: 'not-allowed', opacity: 0.55 }}
        title={comingSoonLabel}
        aria-disabled
      >
        <Icon name={item.icon} size={18} />
        <span>{label}</span>
      </div>
    )
  }

  const stateClass = isActive
    ? 'text-[#FDF9E4] bg-[rgba(255,79,79,0.06)]'
    : 'text-[#8A95A6] hover:text-[#FDF9E4] hover:bg-[rgba(253,249,228,0.03)]'

  return (
    <Link to={item.to} className={`${baseRow} ${stateClass}`}>
      {isActive && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#FF4F4F]"
          aria-hidden
        />
      )}
      <Icon name={item.icon} size={18} />
      <span>{label}</span>
    </Link>
  )
}
