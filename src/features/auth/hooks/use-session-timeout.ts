import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../stores/auth-store'

/** Lock after this long with no user interaction. */
export const IDLE_TIMEOUT_MS = 15 * 60_000 // 15 minutes
/** Hard cap on a single unlocked session, regardless of activity. */
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60_000 // 8 hours
/** How often we check the idle/absolute thresholds. */
const CHECK_INTERVAL_MS = 30_000 // 30 seconds

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
 * session has lasted `ABSOLUTE_TIMEOUT_MS`, then routes to `/unlock`. Uses a
 * lightweight "record last activity + poll" pattern rather than resetting a
 * timer on every mouse move, so it stays cheap under heavy interaction.
 *
 * No-op while the vault is locked (nothing sensitive is in memory to protect).
 * Mount once, high in the authenticated layout.
 */
export function useSessionTimeout() {
  const isVaultLocked = useAuthStore((s) => s.isVaultLocked)
  const expireSession = useAuthStore((s) => s.expireSession)
  const navigate = useNavigate()

  useEffect(() => {
    if (isVaultLocked) return

    const unlockedAt = Date.now()
    let lastActivity = Date.now()
    const markActivity = () => {
      lastActivity = Date.now()
    }

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActivity, { passive: true })
    }

    const interval = window.setInterval(() => {
      const now = Date.now()
      const idle = now - lastActivity >= IDLE_TIMEOUT_MS
      const expired = now - unlockedAt >= ABSOLUTE_TIMEOUT_MS
      if (idle || expired) {
        expireSession()
        void navigate({ to: '/unlock' })
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, markActivity)
      }
    }
  }, [isVaultLocked, expireSession, navigate])
}
