import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage, useAuthStore } from '../features/auth'
import { parseAuthRedirect } from '../shared/lib/auth-redirect'

interface LoginSearch {
  redirect?: string
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: parseAuthRedirect(search.redirect),
  }),
  beforeLoad: ({ search }) => {
    const { accessToken, sessionId } = useAuthStore.getState()
    if (accessToken || sessionId) {
      throw redirect({ href: search.redirect ?? '/' })
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { redirect } = Route.useSearch()
  return <LoginPage redirectTo={redirect} />
}
