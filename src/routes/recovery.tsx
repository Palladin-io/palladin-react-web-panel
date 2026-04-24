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
    const { accessToken } = useAuthStore.getState()
    if (!accessToken) {
      throw redirect({ to: '/login' })
    }
  },
  component: RecoveryPage,
})
