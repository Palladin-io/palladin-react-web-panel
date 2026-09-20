import { createFileRoute } from '@tanstack/react-router'
import { VerifyEmailPage } from '../features/auth'
import { parseAuthRedirect } from '../shared/lib/auth-redirect'

interface VerifyEmailSearch {
  token?: string
  redirect?: string
}

export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    redirect: parseAuthRedirect(search.redirect),
  }),
  component: VerifyEmailRoute,
})

function VerifyEmailRoute() {
  const { token, redirect } = Route.useSearch()
  return <VerifyEmailPage token={token} redirectTo={redirect} />
}
