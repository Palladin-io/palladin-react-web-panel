import { publishBrowserSessionNotice } from './browser-session-notice'
import { logoutBrowserSession } from './browser-session'
import { queryClient } from '../../../shared/api/query-client'
import { analytics } from '../../../shared/lib/analytics'
import { runClientProfileCleanups } from '../../../shared/lib/client-profile-cleanup'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'
import { clearWaitlistDeveloperBenefitAcknowledgement } from '../lib/waitlist-developer-benefit'
import { useAuthStore } from '../stores/auth-store'
import { env } from '../../../shared/lib/env'
import { deliverManualSharedUnlockLogout, recordManualSharedUnlockLogout } from '../shared-unlock/link-runtime'

let clientSessionGeneration = 0

export function captureClientSessionGeneration(): number {
  return clientSessionGeneration
}

export function clientSessionGenerationMatches(generation: number): boolean {
  return generation === clientSessionGeneration
}

function runNonBlockingCleanup(cleanup: () => void): void {
  try {
    cleanup()
  } catch {
    // Key and token cleanup must remain fail-closed if secondary state rejects reset.
  }
}

export function clearClientSession(): Promise<void> {
  clientSessionGeneration += 1
  const userId = useAuthStore.getState().userId
  useAuthStore.getState().logout()
  runNonBlockingCleanup(() => queryClient.clear())
  runNonBlockingCleanup(() => useMemberSyncStore.getState().clear())
  runNonBlockingCleanup(clearWaitlistDeveloperBenefitAcknowledgement)
  runNonBlockingCleanup(() => analytics.reset())
  return runClientProfileCleanups(userId)
}

export async function logoutAndReload(
  destination = '/login',
  bestEffortBeforeReload?: () => Promise<unknown>,
): Promise<void> {
  const { userId, accessToken, sessionId } = useAuthStore.getState()
  const apiUrl = env.apiUrl
  const sharedClosing = recordManualSharedUnlockLogout(userId)
  let cleanup: Promise<unknown> | undefined
  try { cleanup = bestEffortBeforeReload?.() } catch { /* Secondary cleanup cannot prevent local logout. */ }
  const profileCleanup = clearClientSession()
  if (sessionId) publishBrowserSessionNotice('logout', sessionId)
  const generation = captureClientSessionGeneration()
  const delivery = sharedClosing.then(async () => {
    if (!userId || !accessToken || !sessionId) return
    await deliverManualSharedUnlockLogout({ userId, accessToken, sessionId, apiUrl }, () => {
      if (!clientSessionGenerationMatches(generation) || env.apiUrl !== apiUrl || useAuthStore.getState().userId !== null) {
        throw new Error('Shared logout session changed')
      }
    })
  })

  const cookieLogout = delivery.catch(() => undefined).then(async () => {
    if (sessionId) await logoutBrowserSession(sessionId)
  })
  // Network failure leaves the UI logged out; do not silently reload into a live cookie.
  await Promise.all([
    cookieLogout,
    delivery,
    sharedClosing,
    profileCleanup,
    cleanup ? Promise.race([
      cleanup.catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
    ]) : Promise.resolve(),
  ])
  if (!clientSessionGenerationMatches(generation) || env.apiUrl !== apiUrl || useAuthStore.getState().userId !== null) return
  window.location.replace(destination)
}
