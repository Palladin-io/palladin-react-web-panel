import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { UnlockPage } from '../../features/unlock'
import { parseAuthRedirect } from '../../shared/lib/auth-redirect'

interface UnlockSearch {
  redirect?: string
}

export const Route = createFileRoute('/_authenticated/unlock')({
  validateSearch: (search: Record<string, unknown>): UnlockSearch => ({
    redirect: parseAuthRedirect(search.redirect),
  }),
  beforeLoad: ({ search }) => {
    // An already-unlocked vault has no reason to visit this screen —
    // bounce back to the dashboard rather than let the user type a
    // password that will never be used.
    const { isVaultLocked } = useAuthStore.getState()
    if (!isVaultLocked) {
      throw redirect({ href: search.redirect ?? '/' })
    }
  },
  component: UnlockRoute,
})

function UnlockRoute() {
  const { redirect } = Route.useSearch()
  return <UnlockPage redirectTo={redirect} />
}
