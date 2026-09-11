import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { deliverManualSharedUnlockLock, recordManualSharedUnlockLock } from '../shared-unlock/link-runtime'

export async function lockClientSession(): Promise<void> {
  const own = useAuthStore.getState(), apiUrl = env.apiUrl
  const { userId, accessToken, refreshToken } = own
  const generation = own.cryptoSessionGeneration + 1
  const closing = recordManualSharedUnlockLock(userId)
  try { own.lockVault() }
  catch (error) { await closing; throw error }
  await closing
  if (!userId || !accessToken || !refreshToken) return
  await deliverManualSharedUnlockLock({ userId, accessToken, refreshToken, apiUrl }, () => {
    const current = useAuthStore.getState()
    if (!current.isVaultLocked || current.cryptoSessionGeneration !== generation || current.userId !== userId
      || current.accessToken !== accessToken || current.refreshToken !== refreshToken || env.apiUrl !== apiUrl) {
      throw new Error('Shared lock own session changed')
    }
  })
}
