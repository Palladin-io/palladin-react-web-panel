import { useCallback, useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { analytics } from '../../../shared/lib/analytics'
import { resendVerificationEmail } from '../api/auth-api'

/** Client-side throttle window between resend requests (seconds). */
const RESEND_COOLDOWN_SECONDS = 60

/**
 * Resend the email-verification message with a client-side cooldown so the
 * button can't be hammered (the backend rate-limits too — this is UX). Fires
 * `fe:auth:verification-email-resent` on a successful send.
 */
export function useResendVerification() {
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [cooldown])

  const mutation = useMutation({
    mutationFn: resendVerificationEmail,
    onSuccess: () => {
      analytics.capture('auth', 'verification-email-resent')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    },
  })

  const resend = useCallback(() => {
    if (cooldown > 0 || mutation.isPending) return
    mutation.mutate()
  }, [cooldown, mutation])

  return {
    resend,
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    cooldown,
  }
}
