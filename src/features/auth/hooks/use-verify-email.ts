import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { ACCOUNT_QUERY_KEY } from '../../../shared/api/account-api'
import { refreshToken as refreshAuthSession, verifyEmail } from '../api/auth-api'
import { getIsAuthenticated, useAuthStore } from '../stores/auth-store'
import {
  captureClientSessionGeneration,
  clientSessionGenerationMatches,
} from '../session/client-session'

/** Outcome the verification-result screen renders. */
export type VerifyEmailOutcome = 'verified' | 'expired' | 'invalid'

/**
 * Best-effort mapping of a failed verification to expired vs invalid. The
 * backend distinguishes them with the error keys
 * `errors.backend.verification-token-expired` / `...-invalid`; we inspect the
 * response body for "expired" and fall back to "invalid" for anything else
 * (including non-HTTP failures).
 */
async function classifyError(error: unknown): Promise<VerifyEmailOutcome> {
  if (error instanceof HTTPError) {
    try {
      const body = await error.response.text()
      if (body.toLowerCase().includes('expired')) return 'expired'
    } catch {
      // Ignore body-read failures — fall through to "invalid".
    }
  }
  return 'invalid'
}

export function useVerifyEmail() {
  const queryClient = useQueryClient()
  return useMutation<VerifyEmailOutcome, never, string>({
    mutationFn: async (token: string) => {
      try {
        const response = await verifyEmail(token)
        // Only reflect verification into THIS browser's session when it's the
        // logged-in user's own session. The verification link may be opened
        // anonymously (or after signing into a different account on the same
        // browser) — writing `emailVerified: true` there would poison the
        // persisted, anti-regress store and hide the banner for a later account
        // that genuinely isn't verified.
        const authState = useAuthStore.getState()
        if (getIsAuthenticated() && authState.userId === response.userId) {
          authState.markEmailVerified()
          authState.setWaitlistDeveloperBenefit(
            response.waitlistDeveloperBenefitStartedAt,
            response.waitlistDeveloperBenefitEndsAt,
          )

          // The account-verification request activates the waitlist benefit on
          // the backend. Refresh THIS session so its plan claim and exact
          // benefit window take effect immediately. The generation + token
          // checks prevent a late response from restoring a logged-out or
          // switched session.
          const generation = captureClientSessionGeneration()
          const currentRefreshToken = authState.refreshToken
          if (currentRefreshToken) {
            try {
              const refreshed = await refreshAuthSession(currentRefreshToken)
              const currentState = useAuthStore.getState()
              if (clientSessionGenerationMatches(generation)
                && currentState.userId === response.userId
                && currentState.refreshToken === currentRefreshToken) {
                currentState.setTokens(refreshed)
              }
            } catch {
              // Verification already succeeded. A transient session-refresh
              // failure must not turn the success screen into "invalid". The
              // verified response's active benefit remains in memory until the
              // regular refresh path replaces it with authoritative session data.
            }
          }

          queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
        }
        return 'verified'
      } catch (error) {
        return classifyError(error)
      }
    },
  })
}
