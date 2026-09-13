import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../features/auth'
import { PrivacyOnboardingPage } from '../features/privacy'
import { parseAuthRedirect } from '../shared/lib/auth-redirect'

export const Route = createFileRoute('/privacy-choices')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: parseAuthRedirect(search.redirect) }),
  staticData: { consentSession: true },
  beforeLoad: () => {
    const { accessToken, refreshToken } = useAuthStore.getState()
    if (!accessToken && !refreshToken) throw redirect({ to: '/login' })
  },
  component: PrivacyChoicesRoute,
})

function PrivacyChoicesRoute() {
  const { redirect } = Route.useSearch()
  return <PrivacyOnboardingPage redirectTo={redirect} />
}
