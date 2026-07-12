import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ACCOUNT_QUERY_KEY } from '../../../shared/api/account-api'
import { confirmTotp, disableTotp, enrollTotp } from '../api/auth-api'

/**
 * TOTP enrollment mutations. `enroll` fetches the shared secret + otpauth URI
 * (not yet active); `confirm` verifies a code and activates it, returning the
 * one-time recovery codes to show once; `disable` turns it off with a code.
 * Confirm/disable invalidate the account query so the security screen reflects
 * the new `totpEnabled` state.
 */
export function useTotpEnrollment() {
  const queryClient = useQueryClient()

  const enroll = useMutation({ mutationFn: enrollTotp })

  const confirm = useMutation({
    mutationFn: (code: string) => confirmTotp(code.trim()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })

  const disable = useMutation({
    mutationFn: (code: string) => disableTotp(code.trim()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY }),
  })

  return { enroll, confirm, disable }
}
