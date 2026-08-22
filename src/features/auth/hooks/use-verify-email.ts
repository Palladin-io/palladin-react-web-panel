import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../session/use-authenticated-mutation'
import { HTTPError } from 'ky'
import {
  ACCOUNT_QUERY_KEY,
  getAccountForSession,
} from '../../../shared/api/account-api'
import { verifyEmail } from '../api/auth-api'
import { authenticatedQueryKey } from '../session/authenticated-query-key'
import { markEmailVerifiedForSession } from '../session/session-boundary'

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
    mutationFn: async (token: string, context) => {
      try {
        await verifyEmail(token)
      } catch (error) {
        return classifyError(error)
      }

      // The token endpoint is intentionally usable without a session. Reflect
      // its result into Zustand only when the initiating authenticated owner
      // is still current AND a request bound to that same owner confirms the
      // server-side account is now verified. A token opened under A can never
      // mark a later B session verified.
      const owner = context.sessionSnapshot
      if (!owner.userId || (!owner.accessToken && !owner.refreshToken)) {
        return 'verified'
      }
      try {
        context.assertSessionCurrent()
        const account = await getAccountForSession(owner)
        context.assertSessionCurrent()
        if (account.userId !== owner.userId || account.emailVerified !== true) {
          return 'verified'
        }
        if (markEmailVerifiedForSession(owner)) {
          queryClient.invalidateQueries({
            queryKey: authenticatedQueryKey(ACCOUNT_QUERY_KEY),
          })
        }
      } catch {
        // Verification itself succeeded. A failed/stale confirmation must not
        // downgrade that outcome, and must not touch another principal's store.
      }
      return 'verified'
    },
  })
}
