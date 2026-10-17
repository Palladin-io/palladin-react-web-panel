import { OwnSharedUnlockActivityRecorder } from "./own-activity"
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
  const source = new SharedUnlockSourceAuthority(new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl), () => Date.now(), flushManualSharedUnlockClosings,
    (root, session) => {
      const scope = { accountId: session.userId, apiUrl: session.apiUrl }
      sharedUnlockExpiry.remember(scope, root.sequence)
      return sharedUnlockExpiry.checkpoint(scope, root.sequence, sessionDeadline(root), Math.min(root.absoluteDeadlineMs, root.offlineDeadlineMs))
    })
  authority = source
  useAuthStore.subscribe((current, previous) => {
    if (current.isVaultLocked || current.userId !== previous.userId || current.sessionId !== previous.sessionId
      || current.cryptoSessionGeneration !== previous.cryptoSessionGeneration) source.reset()
  })
  return source
}

export async function prepareManualSharedUnlock(account: AccountResponse, authCredential: Uint8Array): Promise<void> {
  const installed = useAuthStore.getState()
  const { accessToken, sessionId, userId, unlockLimits } = installed
  if (!accessToken || !sessionId || !userId || installed.isVaultLocked || !unlockLimits) {
    wipe(authCredential)
    return
  }
  const apiUrl = env.apiUrl
  await getAuthority().prepare({
    session: { accessToken, sessionId, userId, apiUrl }, account, authCredential, limits: unlockLimits,
    assertCurrent: () => {
      const current = useAuthStore.getState()
      if (current.isVaultLocked || current.userId !== userId || current.sessionId !== sessionId || env.apiUrl !== apiUrl
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

export function getSharedUnlockClosingWitness() {
  return getAuthority().closingWitness()
}

export function getSharedUnlockManualLockCheckpoints() {
  return getAuthority().manualLockCheckpoints()
}

export function isManualSharedUnlockPreparing(): boolean {
  return getAuthority().isManualPreparationPending()
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

const activityRecorder = new OwnSharedUnlockActivityRecorder(
  new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl), sharedUnlockExpiry)

/** Called only after the document's isTrusted input gate. Capture own live
 * authority before updating idle; a browser peer has no route to this function. */
export function recordOwnSharedUnlockActivity(at: number): void {
  const before = useAuthStore.getState()
  let authority: ReturnType<SharedUnlockSourceAuthority['captureActivity']> | null = null
  try {
    if (!before.isVaultLocked && before.unlockLimits && Date.now() < sessionDeadline(before.unlockLimits)) {
      authority = getAuthority().captureActivity()
    }
  } catch { /* Ordinary local input still works when sharing is unavailable. */ }
  try { before.recordActivity(at) } catch { authority?.dispose(); return }
  const own = useAuthStore.getState()
  if (!authority || !own.unlockLimits || own.unlockLimits === before.unlockLimits
    || !own.accessToken || !own.sessionId || !own.userId || own.isVaultLocked) {
    authority?.dispose(); return
  }
  const apiUrl = env.apiUrl, controller = new AbortController()
  const session = { apiUrl, userId: own.userId, accessToken: own.accessToken, sessionId: own.sessionId }
  const check = () => {
    const current = useAuthStore.getState()
    if (controller.signal.aborted || env.apiUrl !== apiUrl || current.cryptoSessionGeneration !== own.cryptoSessionGeneration
      || current.isVaultLocked || current.userId !== session.userId || current.accessToken !== session.accessToken
      || current.sessionId !== session.sessionId || current.masterKey !== own.masterKey || current.privateKey !== own.privateKey
      || !current.unlockLimits || Date.now() >= sessionDeadline(current.unlockLimits)) throw new Error('Own activity session changed')
  }
  const unsubscribe = useAuthStore.subscribe(() => { try { check() } catch { controller.abort() } })
  const selected = authority
  activityRecorder.record({ session, authority: selected, idleDeadlineMs: own.unlockLimits.idleDeadlineMs,
    signal: controller.signal, assertCurrent: check,
    dispose: () => { unsubscribe(); controller.abort(); selected.dispose() } })
}
