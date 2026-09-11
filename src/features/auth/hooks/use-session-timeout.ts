import { recordOwnSharedUnlockActivity } from "../shared-unlock/manual-source"
import { useEffect } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useAuthStore } from '../stores/auth-store'
import { sessionDeadline } from '../lib/session-limits'
export { IDLE_TIMEOUT_MS, ABSOLUTE_TIMEOUT_MS } from '../lib/session-limits'

/** How often we check the idle/absolute thresholds. */
const CHECK_INTERVAL_MS = 30_000 // 30 seconds
const ACTIVITY_RECORD_INTERVAL_MS = 1_000

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
] as const

/**
 * Idle + absolute session timeout for an unlocked vault.
 *
 * While the vault is unlocked, wipes the in-memory crypto keys and access token
 * (`expireSession`) once the user has been idle for `IDLE_TIMEOUT_MS` or the
 * session has lasted `ABSOLUTE_TIMEOUT_MS`, then routes to `/unlock`. Reads the original deadlines from the in-memory auth session, so
 * remounting never renews them. Only trusted local events advance own idle,
 * coalesced to at most once per second without adding time on a later retry.
 *
 * No-op while the vault is locked (nothing sensitive is in memory to protect).
 * Mount once, high in the authenticated layout.
 */
export function useSessionTimeout() {
  const isVaultLocked = useAuthStore((s) => s.isVaultLocked)
  const expireSession = useAuthStore((s) => s.expireSession)
  const navigate = useNavigate()
  const router = useRouter()

  useEffect(() => {
    if (isVaultLocked) return

    let lastRecordedActivity = -Infinity
    const markActivity = (event: Event) => {
      const now = Date.now()
      if (!event.isTrusted || now - lastRecordedActivity < ACTIVITY_RECORD_INTERVAL_MS) return
      lastRecordedActivity = now
      recordOwnSharedUnlockActivity(now)
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true })
    }

    const check = () => {
      const state = useAuthStore.getState()
      if (state.isVaultLocked) return
      const limits = state.unlockLimits
      if (!limits || Date.now() < limits.unlockedAtMs || Date.now() >= sessionDeadline(limits)) {
        expireSession()
        void navigate({
          to: '/unlock',
          search: { redirect: router.state.location.href },
        })
      }
    }
    check()
    const interval = window.setInterval(check, CHECK_INTERVAL_MS)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', check)

    return () => {
      window.removeEventListener('pageshow', check)
      document.removeEventListener('visibilitychange', check)
      window.clearInterval(interval)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity)
      }
    }
  }, [isVaultLocked, expireSession, navigate, router])
}
