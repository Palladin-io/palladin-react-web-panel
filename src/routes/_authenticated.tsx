import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import i18n from '../shared/lib/i18n'
import { useAuthStore } from '../features/auth'
import { ACCOUNT_QUERY_KEY, getAccount } from '../shared/api/account-api'
import { AppWordmark } from '../shared/components/app-wordmark'
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

const FRAME_GRADIENT =
  'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)'

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // The unlock screen is intentionally chrome-less — sidebar would let
  // the user click into screens they aren't allowed to see yet.
  if (pathname === '/unlock') return <Outlet />
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: FRAME_GRADIENT }}
    >
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
    key: 'billing',
    labelKey: 'nav.billing',
    icon: 'credit_card',
    to: '/billing',
    matchPrefix: '/billing',
  },
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
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const account = useQuery({
    queryKey: ACCOUNT_QUERY_KEY,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })

  const displayName = account.data?.displayName ?? ''
  const email = account.data?.email ?? ''
  const initials = displayName
    ? displayName
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : email.slice(0, 2).toUpperCase()

  const currentLang = i18n.language === 'pl' ? 'pl' : 'en'

  function handleLogout() {
    logout()
    navigate({ to: '/login' })
  }

  function toggleLanguage() {
    const next = currentLang === 'en' ? 'pl' : 'en'
    i18n.changeLanguage(next)
  }

  return (
    <aside
      className="flex h-full w-[200px] flex-shrink-0 flex-col border-r
        border-[rgba(253,249,228,0.07)]"
      style={{ background: 'rgba(253,249,228,0.02)' }}
    >
      {/* Logo */}
      <div className="px-4 py-5">
        <AppWordmark size="sm" />
      </div>

      {/* Nav */}
      <nav className="mt-1 flex flex-col">
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

      {/* Profile */}
      <div
        className="mt-auto border-t border-[rgba(253,249,228,0.06)] px-4 py-3"
      >
        {/* Avatar + name */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center
              rounded-full text-[10px] font-bold"
            style={{ background: '#FFAB87', color: '#000B2E' }}
          >
            {initials || '?'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-[#FDF9E4]">
              {displayName || email}
            </p>
            <p className="text-[10px] text-[#5A6478]">
              {t('sidebar.freePlan')}
            </p>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1">
          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="flex h-6 items-center rounded px-1.5 text-[10px] font-semibold
              text-[#8A95A6] transition-colors hover:bg-[rgba(253,249,228,0.06)]
              hover:text-[#FDF9E4]"
            title={t('sidebar.languageEN')}
          >
            {currentLang.toUpperCase()}
          </button>

          {/* Theme toggle placeholder — always dark, non-interactive for now */}
          <button
            type="button"
            disabled
            className="flex h-6 w-6 items-center justify-center rounded
              text-[#5A6478] opacity-40"
            title="Dark mode"
          >
            <Icon name="dark_mode" size={14} />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-6 w-6 items-center justify-center rounded
              text-[#5A6478] transition-colors hover:bg-[rgba(255,79,79,0.08)]
              hover:text-[#FF4F4F]"
            title={t('common.logout')}
          >
            <Icon name="logout" size={14} />
          </button>
        </div>
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

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 14px',
    margin: '1px 8px',
    borderRadius: '7px',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'background 0.15s, color 0.15s',
  }

  if (item.disabled || !item.to) {
    return (
      <div
        style={{
          ...baseStyle,
          color: '#5A6478',
          cursor: 'not-allowed',
          opacity: 0.55,
        }}
        title={comingSoonLabel}
        aria-disabled
      >
        <Icon name={item.icon} size={16} />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <Link
      to={item.to}
      style={{
        ...baseStyle,
        color: isActive ? '#FF4F4F' : '#8A95A6',
        background: isActive ? 'rgba(255,79,79,0.12)' : 'transparent',
        textDecoration: 'none',
      }}
      className={
        isActive
          ? ''
          : 'hover:bg-[rgba(253,249,228,0.06)] hover:!text-[#FDF9E4]'
      }
    >
      <Icon name={item.icon} size={16} />
      <span>{label}</span>
    </Link>
  )
}
