import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { deliverManualSharedUnlockLock, recordManualSharedUnlockLock } from '../shared-unlock/link-runtime'

export async function lockClientSession(): Promise<void> {
  const own = useAuthStore.getState(), apiUrl = env.apiUrl
  const { userId, accessToken, sessionId } = own
  const generation = own.cryptoSessionGeneration + 1
  const closing = recordManualSharedUnlockLock(userId)
  try { own.lockVault() }
  catch (error) { await closing; throw error }
  await closing
  if (!userId || !accessToken || !sessionId) return
  await deliverManualSharedUnlockLock({ userId, accessToken, sessionId, apiUrl }, () => {
    const current = useAuthStore.getState()
    if (!current.isVaultLocked || current.cryptoSessionGeneration !== generation || current.userId !== userId
      || current.accessToken !== accessToken || current.sessionId !== sessionId || env.apiUrl !== apiUrl) {
      throw new Error('Shared lock own session changed')
    }
  })
}
