import { useEffect, type ReactNode } from 'react'
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

  // Unmount plaintext-bearing children before waiting for router navigation.
  return blocked || checking ? null : children
}
