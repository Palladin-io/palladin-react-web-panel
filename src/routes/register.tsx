import { createFileRoute, redirect } from '@tanstack/react-router'
import { RegisterPage, useAuthStore } from '../features/auth'
import { parseAuthRedirect } from '../shared/lib/auth-redirect'

interface RegisterSearch { redirect?: string }

export const Route = createFileRoute('/register')({
  validateSearch: (search: Record<string, unknown>): RegisterSearch => ({
    redirect: parseAuthRedirect(search.redirect),
  }),
  beforeLoad: ({ search }) => {
    const { accessToken, sessionId } = useAuthStore.getState()
    if (accessToken || sessionId) {
      throw redirect({ href: search.redirect ?? '/' })
    }
  },
  component: RegisterRoute,
})

function RegisterRoute() {
  const { redirect } = Route.useSearch()
  return <RegisterPage redirectTo={redirect} />
}
