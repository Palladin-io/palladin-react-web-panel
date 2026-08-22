import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from '../shared/lib/i18n'
import {
  captureAuthenticatedSession,
  terminateAuthenticatedSession,
  useAuthenticatedQueryKey,
  useAuthStore,
  useSessionTimeout,
} from '../features/auth'
import { useAgents, AGENT_STATUS_PENDING } from '../features/agents'
import { useThemeStore } from '../shared/stores/theme-store'
import { ACCOUNT_QUERY_KEY, getAccount } from '../shared/api/account-api'
import { getAuthRedirectFromHref } from '../shared/lib/auth-redirect'
import { AppWordmark } from '../shared/components/app-wordmark'
import { Icon } from '../shared/components/icon'
import {
  PERMISSION_AGENT_MANAGE,
  PERMISSION_AUDIT_VIEW,
} from '../shared/lib/permissions'
import {
  SignalRProvider,
  clearPushTokenOnLogout,
  useNotificationsSummary,
  useWebPush,
} from '../features/notifications'
import { MemberSyncProvider, RotationProvider } from '../features/vaults'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { accessToken, refreshToken, isVaultLocked, emailVerified } =
      useAuthStore.getState()
    // A refresh token (persisted) is enough to be "logged in" — the access
    // token is in-memory only and is null right after a reload/timeout, then
    // silently restored by the ky client on the first API call. Only redirect
    // to /login when there is no session to restore at all.
    if (!accessToken && !refreshToken) {
      throw redirect({
        to: '/login',
        search: { redirect: getAuthRedirectFromHref(location.href) },
      })
    }
    // Hard email-verification gate (fast path). A password account must verify
    // its email before it can reach any authenticated surface. We gate on the
    // IN-MEMORY `accessToken` (never persisted) so this only fires when we hold
    // a token whose `email_verified` claim we trust from THIS session — a cold
    // reload (accessToken null) falls through to the layout's account-query
    // gate, which is server-authoritative and can't be fooled by a stale
    // persisted flag. OAuth accounts are always verified, so they never gate.
    if (accessToken && !emailVerified) {
      throw redirect({ to: '/verify-email' })
    }
    // Route based on isVaultLocked, not isOnboarded. isVaultLocked is never
    // persisted — it always starts as true and is set to false only by
    // unlockVault(). This makes it a reliable signal regardless of localStorage.
    if (isVaultLocked && location.pathname !== '/unlock') {
      throw redirect({
        to: '/unlock',
        search: { redirect: location.href },
      })
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
  const standaloneAuthSurface =
    pathname === '/unlock' || pathname === '/invitations/accept'
  const theme = useThemeStore((s) => s.theme)
  const navigate = useNavigate()
  const accessToken = useAuthStore((state) => state.accessToken)
  const userId = useAuthStore((state) => state.userId)
  const memberPrivateKey = useAuthStore((state) => state.privateKey)
  const isVaultLocked = useAuthStore((state) => state.isVaultLocked)
  const accountQueryKey = useAuthenticatedQueryKey(ACCOUNT_QUERY_KEY)

  // Idle + absolute session timeout: locks the vault and drops the access token
  // when the user walks away, then routes to /unlock. No-op while locked.
  useSessionTimeout()

  // Server-authoritative half of the hard email-verification gate. The
  // `beforeLoad` fast path covers fresh sessions; this covers cold reloads
  // (where the in-memory token — and its claim — isn't available yet) and any
  // mid-session change. We only gate on an EXPLICIT `false` from the server, so
  // an unknown/undefined value (older backend, still loading) never locks a
  // user out, and a stale persisted flag can't grant access.
  const account = useQuery({
    queryKey: accountQueryKey,
    queryFn: getAccount,
    staleTime: 5 * 60 * 1000,
  })
  const memberId = account.data?.userId ?? userId
  const emailUnverified = account.data?.emailVerified === false
  useEffect(() => {
    if (emailUnverified) navigate({ to: '/verify-email' })
  }, [emailUnverified, navigate])

  // Vault-lock routing is handled by `beforeLoad` (sync, fires on every
  // navigation). We avoid a mid-session `useEffect` guard here because
  // no caller currently flips `isVaultLocked` to `true` mid-session
  // outside `logout()`, which already redirects to `/login`. When a
  // real `lockVault()` caller lands, prefer `useRouter().invalidate()`
  // after the lock so `beforeLoad` re-runs.

  // Don't render any authenticated surface (shell or unlock) for an unverified
  // account — the redirect above is in flight.
  if (emailUnverified) return null

  return (
    <MemberSyncProvider
      // The access token is deliberately memory-only and can be absent after
      // a reload. Member sync may safely start once the Vault is unlocked;
      // the API client restores the access token through the persisted refresh
      // token on its first authenticated request. Gating on accessToken here
      // otherwise leaves the decrypted session permanently stuck in `idle`.
      enabled={!isVaultLocked}
      // Prefer the authenticated account response after a cold refresh. The
      // persisted auth hint may predate the refreshed token, while `/account`
      // is also the authoritative source used by the unlock operation.
      userId={memberId}
      memberPrivateKey={memberPrivateKey}
    >
      {standaloneAuthSurface ? (
        <Outlet />
      ) : (
        <RotationProvider
          enabled={Boolean(accessToken) && !isVaultLocked}
          memberId={memberId}
          memberPrivateKey={memberPrivateKey}
        >
          <SignalRProvider>
            <div
              className="flex h-screen overflow-hidden"
              style={{ background: GRADIENTS[theme] }}
            >
              <AppSidebar currentPath={pathname} />
              <main className="subtle-scrollbar h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <Outlet />
              </main>
            </div>
          </SignalRProvider>
        </RotationProvider>
      )}
    </MemberSyncProvider>
  )
}

interface NavItem {
  key: string
  labelKey: string
  icon: string
  to?: string
  matchPrefix?: string
  /** Active only on an exact path match (e.g. Home '/'), never on nested routes. */
  exactMatch?: boolean
  disabled?: boolean
  requirePermission?: number
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'home',
    labelKey: 'nav.home',
    icon: 'home',
    to: '/',
    // Home is the one route that must not match by prefix (every path starts
    // with '/'), so it lights up only on the dashboard route itself.
    exactMatch: true,
  },
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
  const accountQueryKey = useAuthenticatedQueryKey(ACCOUNT_QUERY_KEY)

  const account = useQuery({
    queryKey: accountQueryKey,
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

  async function handleLogout() {
    const session = captureAuthenticatedSession()
    void clearPushTokenOnLogout(session)
    if (await terminateAuthenticatedSession(session)) {
      navigate({ to: '/login' })
    }
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
      className="flex h-full w-sidebar flex-shrink-0 flex-col border-r"
      style={{
        background: SIDEBAR_BG[theme],
        borderRightColor: borderColor,
      }}
    >
      {/* Logo header — logo + wordmark + rotating welcome, divider mirrors the profile's */}
      <div
        className="border-b px-5 py-5"
        style={{ borderBottomColor: borderColor }}
      >
        <AppWordmark
          size="sm"
          subtitle={
            <p
              className="mt-1 truncate text-micro font-medium"
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
        className="mt-auto border-t px-4 py-4"
        style={{ borderTopColor: borderColor }}
      >
        {/* Avatar + name */}
        <div className="mb-3.5 flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center
              rounded-full text-micro font-bold"
            style={{ background: '#FFAB87', color: '#0C0E12' }}
          >
            {initials || '?'}
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-meta font-medium"
              style={{ color: textColor }}
            >
              {displayName || email}
            </p>
            <p className="text-micro" style={{ color: mutedColor }}>
              {t('sidebar.freePlan')}
            </p>
          </div>
        </div>

        {/* Actions row */}
        <div className="relative flex items-center justify-between gap-2">
          {/* Language dropdown trigger */}
          <button
            type="button"
            onClick={() => setLangOpen((o) => !o)}
            className="flex h-action items-center gap-1.5 rounded px-2 text-meta
              transition-colors hover:bg-[rgba(232,234,237,0.06)]"
            style={{ color: mutedColor }}
            title={t('nav.languageMenu')}
          >
            <span>{currentFlag}</span>
            <span className="text-micro font-semibold">{currentLang.toUpperCase()}</span>
            <Icon name="expand_more" size={14} />
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
                className="absolute bottom-8 left-0 z-20 min-w-[7.5rem] overflow-hidden
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
                      text-ui transition-colors"
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

          <div className="flex items-center gap-1">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-action w-action items-center justify-center rounded
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
                className="flex h-action w-action items-center justify-center rounded
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

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-action w-action items-center justify-center rounded
                transition-colors hover:bg-[rgb(var(--cv-primary-rgb)/0.08)] hover:text-[var(--cv-primary)]"
              style={{ color: mutedColor }}
              title={t('common.logout')}
            >
              <Icon name="logout" size={14} />
            </button>
          </div>
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
      className="absolute -right-[0.15rem] -top-[0.15rem] inline-flex h-[0.9rem]
        min-w-[0.9rem] items-center justify-center rounded-full px-[0.15rem] text-micro font-bold"
      style={{
        background: 'var(--cv-primary)',
        color: '#FFFFFF',
        lineHeight: 1,
        boxShadow: `0 0 0 calc(1.5px * var(--cv-density-scale)) ${NAV_BADGE_RING[theme]}`,
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

  const isActive = item.exactMatch
    ? currentPath === item.to
    : item.matchPrefix
      ? currentPath === item.matchPrefix ||
        currentPath.startsWith(`${item.matchPrefix}/`)
      : false

  const mutedColor = TEXT_MUTED[theme]
  const textColor = NAV_TEXT[theme]
  const hoverTextColor = theme === 'dark' ? '#E8EAED' : '#0C0E12'

  const baseClassName =
    'mx-2.5 my-0.5 flex items-center gap-2 rounded-lg px-4 py-1.5 text-ui font-medium transition-colors'

  if (item.disabled || !item.to) {
    return (
      <div
        className={baseClassName}
        style={{
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
      className={baseClassName}
      style={{
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
