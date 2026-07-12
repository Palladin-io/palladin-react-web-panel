import { createFileRoute } from '@tanstack/react-router'
import { VerifyEmailPage } from '../features/auth'

interface VerifyEmailSearch {
  token?: string
}

export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): VerifyEmailSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: VerifyEmailRoute,
})

function VerifyEmailRoute() {
  const { token } = Route.useSearch()
  return <VerifyEmailPage token={token} />
}
