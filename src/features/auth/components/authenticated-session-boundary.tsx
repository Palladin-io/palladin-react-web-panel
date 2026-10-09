import { useEffect, useLayoutEffect, type ReactNode } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { getAuthRedirectFromHref } from '../../../shared/lib/auth-redirect'
import { useAuthStore } from '../stores/auth-store'

export function AuthenticatedSessionBoundary({ children }: { children: ReactNode }) {
  const location = useRouterState({ select: state => state.location })
  const navigate = useNavigate()
  const checking = useAuthStore(state => state.sessionRevalidating)
  const locked = useAuthStore(state => state.isVaultLocked)
  const authenticated = useAuthStore(state => Boolean(state.accessToken || state.sessionId))
  const blocked = !authenticated || (locked && location.pathname !== '/unlock')

  useEffect(() => {
    if (!blocked) return
    const current = useAuthStore.getState()
    const hasSession = Boolean(current.accessToken || current.sessionId)
    if (hasSession && (!current.isVaultLocked || location.pathname === '/unlock')) return
    void navigate({ to: hasSession ? '/unlock' : '/login', replace: true,
      search: { redirect: getAuthRedirectFromHref(location.href) } })
  }, [blocked, location.pathname, location.href, navigate, authenticated])

  useLayoutEffect(() => {
    if (!checking) return
    // Portals render outside this subtree. Hide the whole document without
    // unmounting drafts or the key-expiry owner during an authoritative read.
    const body = document.body
    const display = body.style.display
    const inert = body.inert
    body.style.display = 'none'
    body.inert = true
    return () => { body.style.display = display; body.inert = inert }
  }, [checking])

  // Actual lock/logout still destroys plaintext-bearing component state.
  return blocked ? null : children
}
