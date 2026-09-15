import { captureClientSessionGeneration, clientSessionGenerationMatches } from './client-session'
import { useAuthStore } from '../stores/auth-store'

let latestAttempt = 0
let blockingAttempt: number | null = null

/** A newly started/cancelled manual attempt invalidates an in-flight receiver. */
export function captureManualUnlockFence(): () => boolean {
  const captured = latestAttempt
  return () => captured === latestAttempt && blockingAttempt === null
}

export function beginManualUnlockAttempt(options: { blockNewSharedUnlock?: boolean } = {}) {
  const attempt = ++latestAttempt
  // A popup is manual work before its token exchange mutation exists. This
  // RAM-only owner also denies receivers created after the popup was opened.
  blockingAttempt = options.blockNewSharedUnlock ? attempt : null
  const generation = captureClientSessionGeneration()
  const cryptoGeneration = useAuthStore.getState().cryptoSessionGeneration
  const isCurrent = () => attempt === latestAttempt && clientSessionGenerationMatches(generation)
    && useAuthStore.getState().cryptoSessionGeneration === cryptoGeneration
  return {
    isCurrent,
    assertCurrent: () => { if (!isCurrent()) throw new Error('Unlock attempt cancelled') },
    cancel: () => {
      if (attempt === latestAttempt) latestAttempt += 1
      if (blockingAttempt === attempt) blockingAttempt = null
    },
  }
}
