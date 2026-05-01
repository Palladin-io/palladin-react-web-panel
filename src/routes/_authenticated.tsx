import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from '../shared/lib/i18n'
import { useAuthStore } from '../features/auth'
import { useThemeStore } from '../shared/stores/theme-store'
import { ACCOUNT_QUERY_KEY, getAccount } from '../shared/api/account-api'
import { AppWordmark } from '../shared/components/app-wordmark'
import { Icon } from '../shared/components/icon'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { accessToken, isOnboarded, isVaultLocked } = useAuthStore.getState()
    if (!accessToken) {
      throw redirect({ to: '/login' })
    }
    if (isOnboarded && isVaultLocked && location.pathname !== '/unlock') {
      throw redirect({ to: '/unlock' })
    }
  },
  component: AuthenticatedLayout,
})

const GRADIENTS = {
  dark: 'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)',
  light: 'linear-gradient(160deg, #F4F1E4 0%, #EAE6D0 30%, #E4DCCA 60%, #F4F1E4 100%)',
}

const SIDEBAR_BG = {
  dark: 'rgba(253,249,228,0.02)',
  light: 'rgba(0,11,46,0.04)',
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const theme = useThemeStore((s) => s.theme)

  if (pathname === '/unlock') return <Outlet />
  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: GRADIENTS[theme] }}
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

const LANG_OPTIONS = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'pl', flag: '🇵🇱', label: 'Polski' },
] as const

interface AppSidebarProps {
  currentPath: string
}

function AppSidebar({ currentPath }: AppSidebarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const { theme, toggleTheme } = useThemeStore()
  const [langOpen, setLangOpen] = useState(false)

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

  const currentLang = SUPPORTED_LANGUAGES.includes(i18n.language as 'en' | 'pl')
    ? (i18n.language as 'en' | 'pl')
    : 'en'
  const currentFlag = LANG_OPTIONS.find((l) => l.code === currentLang)?.flag ?? '🌐'

  function handleLogout() {
    logout()
    navigate({ to: '/login' })
  }

  function selectLanguage(code: string) {
    i18n.changeLanguage(code)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    setLangOpen(false)
  }

  const textColor = theme === 'dark' ? '#FDF9E4' : '#000B2E'
  const mutedColor = theme === 'dark' ? '#5A6478' : '#8A95A6'
  const borderColor =
    theme === 'dark' ? 'rgba(253,249,228,0.06)' : 'rgba(0,11,46,0.08)'

  return (
    <aside
      className="flex h-full w-[200px] flex-shrink-0 flex-col border-r"
      style={{
        background: SIDEBAR_BG[theme],
        borderColor,
      }}
    >
      {/* Logo — left-aligned with nav items (margin 8px + padding 14px = 22px) */}
      <div className="py-5 pl-[22px] pr-4">
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
            theme={theme}
          />
        ))}
      </nav>

      {/* Profile */}
      <div
        className="mt-auto border-t px-4 py-3"
        style={{ borderColor }}
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
            <p
              className="truncate text-[11px] font-medium"
              style={{ color: textColor }}
            >
              {displayName || email}
            </p>
            <p className="text-[10px]" style={{ color: mutedColor }}>
              {t('sidebar.freePlan')}
            </p>
          </div>
        </div>

        {/* Actions row */}
        <div className="relative flex items-center gap-1">
          {/* Language dropdown trigger */}
          <button
            type="button"
            onClick={() => setLangOpen((o) => !o)}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px]
              transition-colors hover:bg-[rgba(253,249,228,0.06)]"
            style={{ color: mutedColor }}
            title="Language"
          >
            <span>{currentFlag}</span>
            <span className="text-[9px] font-semibold">{currentLang.toUpperCase()}</span>
            <Icon name="expand_more" size={12} />
          </button>

          {/* Language dropdown */}
          {langOpen && (
            <>
              {/* backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setLangOpen(false)}
              />
              <div
                className="absolute bottom-8 left-0 z-20 min-w-[120px] overflow-hidden
                  rounded-lg border shadow-xl"
                style={{
                  background: theme === 'dark' ? '#0D1B3E' : '#F4F1E4',
                  borderColor,
                }}
              >
                {LANG_OPTIONS.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => selectLanguage(lang.code)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left
                      text-[12px] transition-colors"
                    style={{
                      color: lang.code === currentLang ? '#FF4F4F' : textColor,
                      background:
                        lang.code === currentLang
                          ? 'rgba(255,79,79,0.08)'
                          : 'transparent',
                    }}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-6 w-6 items-center justify-center rounded
              transition-colors hover:bg-[rgba(253,249,228,0.06)]"
            style={{ color: mutedColor }}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={14} />
          </button>

          <div className="flex-1" />

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-6 w-6 items-center justify-center rounded
              transition-colors hover:bg-[rgba(255,79,79,0.08)] hover:text-[#FF4F4F]"
            style={{ color: mutedColor }}
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
  theme: 'dark' | 'light'
}

function SidebarLink({
  item,
  label,
  comingSoonLabel,
  currentPath,
  theme,
}: SidebarLinkProps) {
  const isActive = item.matchPrefix
    ? currentPath === item.matchPrefix ||
      currentPath.startsWith(`${item.matchPrefix}/`)
    : false

  const mutedColor = theme === 'dark' ? '#5A6478' : '#8A95A6'
  const textColor = theme === 'dark' ? '#8A95A6' : '#4A5568'

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
          color: mutedColor,
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
        color: isActive ? '#FF4F4F' : textColor,
        background: isActive ? 'rgba(255,79,79,0.12)' : 'transparent',
        textDecoration: 'none',
      }}
      className={isActive ? '' : 'hover:bg-[rgba(253,249,228,0.06)] hover:!text-[#FDF9E4]'}
    >
      <Icon name={item.icon} size={16} />
      <span>{label}</span>
    </Link>
  )
}
