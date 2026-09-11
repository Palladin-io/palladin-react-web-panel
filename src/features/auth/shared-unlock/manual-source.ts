import { sharedUnlockExpiry } from './expiry-runtime'
import type { AccountResponse } from '../../../shared/api/account-api'
import { wipe } from '../../../shared/crypto/sodium'
import { env } from '../../../shared/lib/env'
import { sessionDeadline } from '../lib/session-limits'
import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockApi, SharedUnlockApiError } from './api'
import { flushManualSharedUnlockClosings } from './link-runtime'
import { SharedUnlockSourceAuthority } from './source-authority'

let authority: SharedUnlockSourceAuthority | null = null

function getAuthority(): SharedUnlockSourceAuthority {
  if (authority) return authority
  const source = new SharedUnlockSourceAuthority(new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl), Date.now, flushManualSharedUnlockClosings,
    (root, session) => sharedUnlockExpiry.remember({ accountId: session.userId, apiUrl: session.apiUrl }, root.sequence))
  authority = source
  useAuthStore.subscribe((current, previous) => {
    if (current.isVaultLocked || current.userId !== previous.userId
      || current.cryptoSessionGeneration !== previous.cryptoSessionGeneration) source.reset()
  })
  return source
}

export async function prepareManualSharedUnlock(account: AccountResponse, authCredential: Uint8Array): Promise<void> {
  const installed = useAuthStore.getState()
  const { accessToken, refreshToken, userId, unlockLimits } = installed
  if (!accessToken || !refreshToken || !userId || installed.isVaultLocked || !unlockLimits) {
    wipe(authCredential)
    return
  }
  const apiUrl = env.apiUrl
  await getAuthority().prepare({
    session: { accessToken, refreshToken, userId, apiUrl }, account, authCredential, limits: unlockLimits,
    assertCurrent: () => {
      const current = useAuthStore.getState()
      if (current.isVaultLocked || current.userId !== userId || env.apiUrl !== apiUrl
        || current.cryptoSessionGeneration !== installed.cryptoSessionGeneration
        || current.masterKey !== installed.masterKey || current.privateKey !== installed.privateKey
        || !current.unlockLimits || Date.now() >= sessionDeadline(current.unlockLimits)) {
        throw new SharedUnlockApiError('cancelled')
      }
    },
  })
}


/** Current own root and its original RAM generation, never a generation from a Port. */
export function getSharedUnlockSourceSnapshot() {
  return getAuthority().snapshot()
}

export function subscribeSharedUnlockSource(listener: () => void): () => void {
  return getAuthority().subscribe(listener)
}
export function acceptSharedUnlockPreference(preference: import('./api-types').SharedUnlockPreference, generation: string): void {
  getAuthority().acceptPreference(preference, generation)
}
export function adoptSharedUnlockSource(authorization: import('./api-types').SharedUnlockAuthorization, generation: string,
  preference: import('./api-types').SharedUnlockPreference, assertOwnCurrent: () => void): void {
  assertOwnCurrent()
  sharedUnlockExpiry.remember({ accountId: authorization.accountId, apiUrl: env.apiUrl }, authorization.sequence)
  getAuthority().adopt(authorization, generation, preference, assertOwnCurrent)
}
