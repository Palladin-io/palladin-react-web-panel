import { useGoogleLogin } from '@react-oauth/google'
import { useCallback, useEffect, useRef, useState } from 'react'
import { clearClientSession } from '../session/client-session'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'
import { useLogin } from './use-login'
import { duringManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'

const POPUP_DEADLINE_MS = 5 * 60_000
interface PopupAttempt {
  readonly state: string
  readonly guard: ReturnType<typeof beginManualUnlockAttempt>
  readonly deadline: number
  readonly timer: ReturnType<typeof setTimeout>
  consumed: boolean
}

/** A Google popup owns a manual attempt before the backend mutation exists. */
export function useGoogleSignIn(redirectTo: string) {
  const oauth = useLogin(redirectTo)
  const active = useRef<PopupAttempt | null>(null)
  const mounted = useRef(true)
  const [popupPending, setPopupPending] = useState(false)
  const [googleError, setGoogleError] = useState(false)
  const finish = useCallback((attempt: PopupAttempt) => {
    clearTimeout(attempt.timer)
    attempt.guard.cancel()
    if (active.current !== attempt) return
    active.current = null
    if (mounted.current) setPopupPending(false)
  }, [])
  const cancel = useCallback(() => { if (active.current) finish(active.current) }, [finish])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; cancel() }
  }, [cancel])

  const assertCurrent = (attempt: PopupAttempt) => {
    attempt.guard.assertCurrent()
    if (!mounted.current || active.current !== attempt || Date.now() >= attempt.deadline) {
      throw new Error('Google login attempt cancelled')
    }
  }
  const googleLogin = useGoogleLogin({
    onSuccess: response => {
      const attempt = active.current
      // The SDK invokes the latest callback ref. Its per-request state must
      // match our original RAM attempt, never merely whichever popup is current.
      if (!attempt || attempt.consumed || response.state !== attempt.state) return
      try {
        assertCurrent(attempt)
        attempt.consumed = true
        oauth.mutate({ googleToken: response.access_token,
          assertCurrent: () => assertCurrent(attempt), finish: () => finish(attempt) })
      } catch { finish(attempt) }
    },
    onError: response => {
      const attempt = active.current
      if (!attempt) return
      if ('state' in response && response.state !== attempt.state) return
      finish(attempt)
      if (mounted.current) setGoogleError(true)
    },
    onNonOAuthError: error => {
      // These SDK errors have no request state. They can only cancel, never
      // authorize an exchange or adopt tokens from another popup.
      cancel()
      if (mounted.current && error.type !== 'popup_closed') setGoogleError(true)
    },
  })

  const start = () => {
    if (active.current || oauth.isPending) return
    setGoogleError(false)
    setPopupPending(true)
    try {
      const state = crypto.randomUUID()
      // clearClientSession advances/wipes synchronously, then returns only the
      // profile cleanup wait. Capture the barrier before yielding to that wait.
      const cleanup = duringManualLoginCleanup(clearClientSession)
      const guard = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
      const attempt: PopupAttempt = { state, guard, deadline: Date.now() + POPUP_DEADLINE_MS, consumed: false,
        timer: setTimeout(() => {
          if (active.current !== attempt) return
          finish(attempt)
          if (mounted.current) setGoogleError(true)
        }, POPUP_DEADLINE_MS) }
      active.current = attempt
      void cleanup.then(() => {
        assertCurrent(attempt)
        googleLogin({ state })
      }).catch(() => {
        const own = active.current === attempt
        finish(attempt)
        if (mounted.current && own) setGoogleError(true)
      })
    } catch {
      cancel()
      setPopupPending(false)
      setGoogleError(true)
    }
  }
  return { start, cancel, isPending: popupPending || oauth.isPending, isError: oauth.isError, googleError }
}
