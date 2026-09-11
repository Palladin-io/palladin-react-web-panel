import { SharedUnlockApiError, type SharedUnlockApi, type SharedUnlockOwnSession } from './api'
import type { SharedUnlockPreference } from './api-types'
import type { SharedUnlockPreferenceGate } from './preference-gate'

export async function saveSharedUnlockPreference(input: {
  session: SharedUnlockOwnSession
  enabled: boolean
  revision: number
  signal: AbortSignal
  pause?: ReturnType<SharedUnlockPreferenceGate['pause']>
  assertCurrent(): void
  accept(preference: SharedUnlockPreference): void
}, api: Pick<SharedUnlockApi, 'setPreference'>, gate: SharedUnlockPreferenceGate): Promise<SharedUnlockPreference> {
  const scope = { accountId: input.session.userId, apiUrl: input.session.apiUrl }
  const abort = new AbortController(), signal = AbortSignal.any([abort.signal, input.signal])
  const deadline = Date.now() + 10_000, timer = setTimeout(() => abort.abort(), 10_000)
  const check = () => {
    if (signal.aborted || Date.now() >= deadline) throw new SharedUnlockApiError('cancelled')
    input.assertCurrent()
  }
  const wait = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const cancelled = () => reject(new SharedUnlockApiError('cancelled'))
    if (signal.aborted) cancelled()
    else signal.addEventListener('abort', cancelled, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled))
  })
  try {
    check()
    const pause = input.pause ?? gate.pause(scope)
    await wait(pause.persisted); check()
    const preference = await wait(api.setPreference(input.session, input.enabled, input.revision, signal)); check()
    input.accept(preference); check()
    // After either successful account choice, only Identity controls ON/OFF.
    // Failed/unconfirmed writes keep the separate local denial across restart.
    await wait(gate.complete(scope, pause.id, check)); check()
    return preference
  } finally { clearTimeout(timer); abort.abort() }
}
