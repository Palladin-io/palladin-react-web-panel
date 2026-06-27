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
import { useAgents, AGENT_STATUS_PENDING } from '../features/agents'
import { useThemeStore } from '../shared/stores/theme-store'
import { ACCOUNT_QUERY_KEY, getAccount } from '../shared/api/account-api'
import { AppWordmark } from '../shared/components/app-wordmark'
import { Icon } from '../shared/components/icon'
import {
  PERMISSION_AGENT_MANAGE,
  PERMISSION_AUDIT_VIEW,
  PERMISSION_READ_API_KEY,
} from '../shared/lib/permissions'
import {
  SignalRProvider,
  clearPushTokenOnLogout,
  useNotificationsSummary,
  useWebPush,
} from '../features/notifications'


export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { accessToken, isVaultLocked } = useAuthStore.getState()
    if (!accessToken) {
      throw redirect({ to: '/login' })
    }
    // Route based on isVaultLocked, not isOnboarded. isVaultLocked is never
    // persisted — it always starts as true and is set to false only by
    // unlockVault(). This makes it a reliable signal regardless of localStorage.
    if (isVaultLocked && location.pathname !== '/unlock') {
      throw redirect({ to: '/unlock' })
    }
  },
  component: AuthenticatedLayout,
})

const GRADIENTS = {
  dark: 'linear-gradient(160deg, #15171B 0%, #212429 30%, #1A1D22 60%, #15171B 100%)',
  light:
    'radial-gradient(125% 95% at 72% 0%, #F8FAFC 0%, #E7EAEF 46%, #D6DAE2 100%)',
}

const SIDEBAR_BG = {
  // Sidebar contrasts with the content gradient: darker than it in dark mode,
  // lighter (near-white) than it in light mode — so it reads as a distinct rail.
  dark: 'rgba(0, 0, 0, 0.25)',
  light: 'rgba(255, 255, 255, 0.45)',
}

const SIDEBAR_BORDER = {
  dark: 'rgba(232, 234, 237,0.07)',
  light: 'rgba(12, 14, 18, 0.06)',
}

const NAV_TEXT = {
  dark: '#8A95A6',
  light: '#3D4E66',
}

const NAV_HOVER_BG = {
  dark: 'rgba(232, 234, 237,0.06)',
  light: 'rgba(12, 14, 18, 0.04)',
}

const NAV_ACTIVE_BG = {
  dark: 'rgb(var(--cv-primary-rgb) / 0.12)',
  light: 'rgb(var(--cv-primary-rgb) / 0.08)',
}

const TEXT_PRIMARY = {
  dark: '#E8EAED',
  light: '#0C0E12',
}

const TEXT_MUTED = {
  dark: '#5A6478',
  light: '#8A95A6',
}

const DROPDOWN_BG = {
  dark: '#181B22',
  light: '#F5F7FA',
}

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const theme = useThemeStore((s) => s.theme)

  // Vault-lock routing is handled by `beforeLoad` (sync, fires on every
  // navigation). We avoid a mid-session `useEffect` guard here because
  // no caller currently flips `isVaultLocked` to `true` mid-session
  // outside `logout()`, which already redirects to `/login`. When a
  // real `lockVault()` caller lands, prefer `useRouter().invalidate()`
  // after the lock so `beforeLoad` re-runs.

  if (pathname === '/unlock') return <Outlet />
  return (
    // SignalRProvider self-gates on auth + unlocked vault, so it only opens a
    // connection once we're past the guards above.
    <SignalRProvider>
      <div
        className="flex h-screen overflow-hidden"
        style={{ background: GRADIENTS[theme] }}
      >
        <AppSidebar currentPath={pathname} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </div>
    </SignalRProvider>
  )
}

interface NavItem {
  key: string
  labelKey: string
  icon: string
  to?: string
  matchPrefix?: string
  disabled?: boolean
  requirePermission?: number
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'vaults',
    labelKey: 'nav.vaults',
    icon: 'shield',
    to: '/vaults',
    matchPrefix: '/vaults',
  },
  {
    key: 'inbox',
    labelKey: 'nav.inbox',
    icon: 'inbox',
    to: '/inbox',
    matchPrefix: '/inbox',
  },
  {
    key: 'agents',
    labelKey: 'nav.agents',
    icon: 'smart_toy',
    to: '/agents',
    matchPrefix: '/agents',
    requirePermission: PERMISSION_AGENT_MANAGE,
  },
  {
    key: 'audit',
    labelKey: 'nav.auditLog',
    icon: 'history',
    to: '/audit',
    matchPrefix: '/audit',
    requirePermission: PERMISSION_AUDIT_VIEW,
  },
  {
    key: 'billing',
    labelKey: 'nav.billing',
    icon: 'credit_card',
    to: '/billing',
    matchPrefix: '/billing',
  },
  {
    key: 'api-keys',
    labelKey: 'nav.apiKeys',
    icon: 'key',
    to: '/api-keys',
    matchPrefix: '/api-keys',
    requirePermission: PERMISSION_READ_API_KEY,
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    icon: 'settings',
    to: '/settings',
    matchPrefix: '/settings',
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
  const permissions = useAuthStore((s) => s.permissions)
  const { theme, toggleTheme } = useThemeStore()
  const webPush = useWebPush()
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => item.requirePermission === undefined || (permissions & item.requirePermission) !== 0,
  )

  // Attention badges reuse the keys SignalR invalidates, so counts update live.
  const notificationsSummary = useNotificationsSummary()
  const agents = useAgents()
  const navBadges: Record<string, number> = {
    inbox: notificationsSummary.data?.unreadCount ?? 0,
    agents:
      agents.data?.filter((a) => a.status === AGENT_STATUS_PENDING).length ?? 0,
  }

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
    // Best-effort: delete the FCM push token server-side before the JWT is
    // cleared. Fire-and-forget — logout must not wait on or fail from cleanup.
    void clearPushTokenOnLogout()
    logout()
    navigate({ to: '/login' })
  }

  function selectLanguage(code: string) {
    i18n.changeLanguage(code)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    setLangOpen(false)
  }

  const textColor = TEXT_PRIMARY[theme]
  const mutedColor = TEXT_MUTED[theme]
  const borderColor = SIDEBAR_BORDER[theme]

  return (
    <aside
      className="flex h-full w-[200px] flex-shrink-0 flex-col border-r"
      style={{
        background: SIDEBAR_BG[theme],
        borderRightColor: borderColor,
      }}
    >
      {/* Logo header — logo + wordmark + rotating welcome, divider mirrors the profile's */}
      <div
        className="border-b px-4 py-5"
        style={{ borderBottomColor: borderColor }}
      >
        <AppWordmark
          size="sm"
          subtitle={
            <p
              className="mt-0.5 truncate text-[10px] font-medium"
              style={{ color: mutedColor }}
            >
              {displayName || email
                ? `Welcome back, ${(displayName || email).split(' ')[0]}`
                : 'Welcome back'}
            </p>
          }
        />
      </div>

      {/* Nav */}
      <nav className="mt-1 flex flex-col">
        {visibleNavItems.map((item) => (
          <SidebarLink
            key={item.key}
            item={item}
            label={t(item.labelKey)}
            comingSoonLabel={t('nav.comingSoon')}
            currentPath={currentPath}
            theme={theme}
            badge={navBadges[item.key] ?? 0}
          />
        ))}
      </nav>

      {/* Profile */}
      <div
        className="mt-auto border-t px-4 py-3"
        style={{ borderTopColor: borderColor }}
      >
        {/* Avatar + name */}
        <div className="mb-3 flex items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center
              rounded-full text-[10px] font-bold"
            style={{ background: '#FFAB87', color: '#0C0E12' }}
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
              transition-colors hover:bg-[rgba(232,234,237,0.06)]"
            style={{ color: mutedColor }}
            title={t('nav.languageMenu')}
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
                  background: DROPDOWN_BG[theme],
                  borderColor: borderColor,
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
                      color: lang.code === currentLang ? 'var(--cv-primary)' : textColor,
                      background:
                        lang.code === currentLang
                          ? 'rgb(var(--cv-primary-rgb) / 0.08)'
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
              transition-colors hover:bg-[rgba(232,234,237,0.06)]"
            style={{ color: mutedColor }}
            title={theme === 'dark' ? t('nav.themeSwitchToLight') : t('nav.themeSwitchToDark')}
          >
            <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} size={14} />
          </button>

          {/* Enable push notifications — only while supported and not yet
              registered. Deliberate user action triggers the permission prompt;
              we never request permission automatically on load. */}
          {webPush.isSupported && webPush.status !== 'registered' && (
            <button
              type="button"
              onClick={() => void webPush.requestPermissionAndRegister()}
              disabled={webPush.status === 'denied'}
              className="flex h-6 w-6 items-center justify-center rounded
                transition-colors hover:bg-[rgba(232,234,237,0.06)]
                disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: mutedColor }}
              title={
                webPush.status === 'denied'
                  ? t('notifications.pushBlocked')
                  : t('notifications.enablePush')
              }
            >
              <Icon
                name={webPush.status === 'denied' ? 'notifications_off' : 'notifications'}
                size={14}
              />
            </button>
          )}

          <div className="flex-1" />

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-6 w-6 items-center justify-center rounded
              transition-colors hover:bg-[rgb(var(--cv-primary-rgb)/0.08)] hover:text-[var(--cv-primary)]"
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
  /** Attention count; a red chip renders only when > 0. */
  badge?: number
}

/** Base colour the sidebar sits on (page gradient edge) — used as a thin badge
 *  ring so the corner overlay cleanly cuts out from the icon beneath it. */
const NAV_BADGE_RING = {
  dark: '#15171B',
  light: '#E8EAED',
}

/**
 * Small notification-style count overlaid on the top-right corner of a nav
 * icon — a discreet dot with a digit, proportional to the 16px icon (~14px).
 * Thin 1.5px ring in the sidebar base colour keeps it cleanly cut from the
 * icon without looking detached. Renders only when count > 0; clamps to "99+".
 */
function NavBadge({ count, theme }: { count: number; theme: 'dark' | 'light' }) {
  const display = count > 99 ? '99+' : String(count)
  return (
    <span
      aria-label={`${count} pending`}
      style={{
        position: 'absolute',
        top: '-3px',
        right: '-3px',
        minWidth: '14px',
        height: '14px',
        padding: '0 3px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '9999px',
        background: 'var(--cv-primary)',
        color: '#FFFFFF',
        fontSize: '9px',
        fontWeight: 700,
        lineHeight: 1,
        boxShadow: `0 0 0 1.5px ${NAV_BADGE_RING[theme]}`,
        pointerEvents: 'none',
      }}
    >
      {display}
    </span>
  )
}

function SidebarLink({
  item,
  label,
  comingSoonLabel,
  currentPath,
  theme,
  badge = 0,
}: SidebarLinkProps) {
  const [hovered, setHovered] = useState(false)

  const isActive = item.matchPrefix
    ? currentPath === item.matchPrefix ||
      currentPath.startsWith(`${item.matchPrefix}/`)
    : false

  const mutedColor = TEXT_MUTED[theme]
  const textColor = NAV_TEXT[theme]
  const hoverTextColor = theme === 'dark' ? '#E8EAED' : '#0C0E12'

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

  const activeBg = NAV_ACTIVE_BG[theme]
  const hoverBg = NAV_HOVER_BG[theme]

  return (
    <Link
      to={item.to}
      style={{
        ...baseStyle,
        color: isActive ? 'var(--cv-primary)' : hovered ? hoverTextColor : textColor,
        background: isActive ? activeBg : hovered ? hoverBg : 'transparent',
        textDecoration: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Icon wrapper is the positioning context for the corner count badge. */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon name={item.icon} size={16} />
        {badge > 0 && <NavBadge count={badge} theme={theme} />}
      </span>
      <span>{label}</span>
    </Link>
  )
}
