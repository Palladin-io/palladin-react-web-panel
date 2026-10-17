import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockApi, SharedUnlockApiError } from './api'
import { sharedUnlockLinks } from './link-runtime'
import { flushSharedUnlockClosings } from './closing'

export interface SharedUnlockLinkAction {
  readonly accountId: string
  readonly generation: number
  readonly linkId: string
}

const api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl)

function capture(input: SharedUnlockLinkAction) {
  const own = useAuthStore.getState()
  if (!env.sharedUnlockExtensionId || own.userId !== input.accountId || own.cryptoSessionGeneration !== input.generation) {
    throw new SharedUnlockApiError('cancelled')
  }
  const scope = { accountId: input.accountId, apiUrl: env.apiUrl, webOrigin: window.location.origin, extensionId: env.sharedUnlockExtensionId }
  return { own: { accessToken: own.accessToken, sessionId: own.sessionId, lockVault: own.lockVault }, scope }
}

async function bounded(input: SharedUnlockLinkAction, captured: ReturnType<typeof capture>,
  action: (context: { session: { userId: string; apiUrl: string; accessToken: string; sessionId: string };
    signal: AbortSignal; check(): void; wait<T>(work: Promise<T>): Promise<T> }) => Promise<void>,
  beforeAuthentication?: Promise<unknown>): Promise<void> {
  const abort = new AbortController(), deadline = Date.now() + 10_000
  const { own, scope } = captured
  const check = () => {
    const current = useAuthStore.getState()
    if (abort.signal.aborted || Date.now() >= deadline || current.userId !== input.accountId
      || current.cryptoSessionGeneration !== input.generation || current.accessToken !== own.accessToken
      || current.sessionId !== own.sessionId || env.apiUrl !== scope.apiUrl
      || env.sharedUnlockExtensionId !== scope.extensionId || window.location.origin !== scope.webOrigin) throw new SharedUnlockApiError('cancelled')
  }
  const wait = <T>(work: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const cancel = () => reject(new SharedUnlockApiError('cancelled'))
    if (abort.signal.aborted) cancel(); else abort.signal.addEventListener('abort', cancel, { once: true })
    work.then(resolve, reject).finally(() => abort.signal.removeEventListener('abort', cancel))
  })
  const timer = setTimeout(() => abort.abort(), 10_000)
  const unsubscribe = useAuthStore.subscribe(() => { try { check() } catch { abort.abort() } })
  try {
    check()
    if (beforeAuthentication) { await wait(beforeAuthentication); check() }
    if (!own.accessToken || !own.sessionId) throw new SharedUnlockApiError('unauthorized')
    await action({ session: { userId: input.accountId, apiUrl: scope.apiUrl, accessToken: own.accessToken, sessionId: own.sessionId },
      signal: abort.signal, check, wait })
  } finally { unsubscribe(); clearTimeout(timer); abort.abort() }
}

export async function disconnectSharedUnlockLink(input: SharedUnlockLinkAction): Promise<void> {
  const captured = capture(input)
  const closing = sharedUnlockLinks.beginClosing(captured.scope, input.linkId, 'disconnect', 0, null)
  void closing.catch(() => {})
  try { captured.own.lockVault() }
  catch (error) { await closing; throw error }
  await bounded({ ...input, generation: input.generation + 1 }, captured, async ({ session, signal, check, wait }) => {
    await wait(flushSharedUnlockClosings(captured.scope, session, sharedUnlockLinks, api, signal, check)); check()
  }, closing)
}

export async function reconnectSharedUnlockLink(input: SharedUnlockLinkAction): Promise<void> {
  const captured = capture(input)
  await bounded(input, captured, async ({ session, signal, check, wait }) => {
    const marker = await wait(sharedUnlockLinks.repair(captured.scope)); check()
    if (!marker || marker.linkId !== input.linkId || !marker.disconnectId) throw new SharedUnlockApiError('conflict')
    const disconnectId = marker.disconnectId
    await wait(flushSharedUnlockClosings(captured.scope, session, sharedUnlockLinks, api, signal, check)); check()
    const current = await wait(sharedUnlockLinks.read(captured.scope)); check()
    if (current?.disconnectId !== disconnectId || current.pending.length) throw new SharedUnlockApiError('conflict')
    const link = await wait(api.readLink(session, input.linkId, signal)); check()
    // An explicit retry may finish a local clear after Identity already reconnected.
    const receipt = link.state === 'revoked' ? await wait(api.reconnect(session, input.linkId, link.revision, signal)) : link
    check()
    await wait(sharedUnlockLinks.acknowledgeReconnect(captured.scope, input.linkId, disconnectId, receipt, check, true)); check()
    captured.own.lockVault()
  })
}
