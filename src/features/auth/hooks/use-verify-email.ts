import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { ACCOUNT_QUERY_KEY } from '../../../shared/api/account-api'
import { verifyEmail } from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

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
        await verifyEmail(token)
        // Reflect verification in the session if the user is logged in, so the
        // banner (which reads the account query) disappears immediately.
        useAuthStore.getState().markEmailVerified()
        queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
        return 'verified'
      } catch (error) {
        return classifyError(error)
      }
    },
  })
}
