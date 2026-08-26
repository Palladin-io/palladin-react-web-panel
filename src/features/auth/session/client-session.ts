import { queryClient } from '../../../shared/api/query-client'
import { analytics } from '../../../shared/lib/analytics'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'
import { clearWaitlistDeveloperBenefitAcknowledgement } from '../lib/waitlist-developer-benefit'
import { useAuthStore } from '../stores/auth-store'

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

export function clearClientSession(): void {
  clientSessionGeneration += 1
  useAuthStore.getState().logout()
  runNonBlockingCleanup(() => queryClient.clear())
  runNonBlockingCleanup(() => useMemberSyncStore.getState().clear())
  runNonBlockingCleanup(clearWaitlistDeveloperBenefitAcknowledgement)
  runNonBlockingCleanup(() => analytics.reset())
}

export async function logoutAndReload(
  destination = '/login',
  bestEffortBeforeReload?: () => Promise<unknown>,
): Promise<void> {
  const cleanup = bestEffortBeforeReload?.()
  clearClientSession()

  if (cleanup) {
    await Promise.race([
      cleanup.catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
    ])
  }
  window.location.replace(destination)
}
