import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../features/auth'
import { RecoveryPage } from '../features/recovery'

/**
 * Recovery lives outside `_authenticated` because that layout redirects
 * locked vaults straight to `/unlock` — which is exactly the screen the
 * user is trying to escape from. We still require a valid JWT (the
 * backend enforces it) so we bounce unauthenticated visitors to /login.
 */
export const Route = createFileRoute('/recovery')({
  beforeLoad: () => {
    // accessToken is in-memory only (null after reload); a persisted refresh token still counts as authenticated.
    const { accessToken, refreshToken } = useAuthStore.getState()
    if (!accessToken && !refreshToken) {
      throw redirect({ to: '/login' })
    }
  },
  component: RecoveryPage,
})
