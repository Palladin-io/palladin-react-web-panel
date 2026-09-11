import { captureClientSessionGeneration, clientSessionGenerationMatches } from './client-session'
import { useAuthStore } from '../stores/auth-store'

let latestAttempt = 0

export function beginManualUnlockAttempt() {
  const attempt = ++latestAttempt
  const generation = captureClientSessionGeneration()
  const cryptoGeneration = useAuthStore.getState().cryptoSessionGeneration
  const isCurrent = () => attempt === latestAttempt && clientSessionGenerationMatches(generation)
    && useAuthStore.getState().cryptoSessionGeneration === cryptoGeneration
  return {
    isCurrent,
    assertCurrent: () => { if (!isCurrent()) throw new Error('Unlock attempt cancelled') },
    cancel: () => { if (attempt === latestAttempt) latestAttempt += 1 },
  }
}
