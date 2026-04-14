import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../features/auth'

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
  return <Outlet />
}
