import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { coordinateSharedUnlockBrowser } from './browser-runtime'
import type { SharedUnlockBrowserRoute } from './browser-channel'
import type { SharedUnlockOperationMessage } from './browser-operation-message'
import { sharedUnlockPreferences } from './preference-state-runtime'
import { sharedUnlockPreferenceGate } from './preference-runtime'
import { adoptSharedUnlockSource, getSharedUnlockSourceSnapshot } from './manual-source'
import fixtures from './fixtures/session-api-v1.json'
import { sharedUnlockLinks } from './link-runtime'

vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test', sharedUnlockExtensionId: '' } }))
const apiUrl = 'https://api.example.test', root = fixtures.operations[0].sourceAuthorization
const scope = { apiUrl, accountId: root.accountId }
let now = root.unlockedAtMs + 1
const cleanup: (() => void)[] = []
function start() {
  const abort = new AbortController(), listeners = new Set<(message: SharedUnlockOperationMessage) => void>()
  const sent: SharedUnlockOperationMessage[] = []
  const route: SharedUnlockBrowserRoute = { apiUrl, webOrigin: 'https://web.test', extensionId: 'a'.repeat(32),
    channelId: 'A'.repeat(43), documentBinding: 'own-document', signal: abort.signal,
    close: () => abort.abort(), assertCurrent: () => { if (abort.signal.aborted) throw new Error('retired') },
    verifyCurrent: async () => { route.assertCurrent() }, sendOperation: message => { sent.push(message) },
    onOperation: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } }
  const runtime = coordinateSharedUnlockBrowser(route)
  cleanup.push(() => { runtime.close(); route.close(); expect(listeners.size).toBe(0) })
  return { sent, emit: (message: SharedUnlockOperationMessage) => { now += 1001; for (const listener of listeners) listener(message) }, hint: () => { now += 1001; for (const listener of listeners) listener({ attemptId: 'B'.repeat(42) + 'A', payload: { kind: 'preference-invalidated' } }) } }
}
beforeEach(() => {
  now = root.unlockedAtMs + 1
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  useAuthStore.setState({ userId: root.accountId, accessToken: 'own-access', refreshToken: 'own-refresh' })
})
afterEach(() => {
  for (const close of cleanup.splice(0)) close()
  useAuthStore.getState().logout(); localStorage.clear(); sharedUnlockPreferences.clear()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('repairs OFF and ON through the real Web coordinator without Settings, key replacement or renewed authority', async () => {
  useAuthStore.getState().unlockVault(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4), root)
  const initial = useAuthStore.getState()
  adoptSharedUnlockSource(root, 'A'.repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => {
    if (useAuthStore.getState().cryptoSessionGeneration !== initial.cryptoSessionGeneration) throw new Error('changed')
  })
  const before = getSharedUnlockSourceSnapshot()
  let preference = { sharedUnlockEnabled: false, revision: 2 }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(preference)))
  vi.stubGlobal('fetch', fetcher)
  const f = start()
  const lastState = () => f.sent.filter(message => message.payload.kind === 'state').at(-1)?.payload
  await vi.waitFor(() => expect(lastState()).toMatchObject({ status: 'unlocked', source: null }))
  expect(sharedUnlockPreferences.isDisabled(scope)).toBe(true)
  preference = { sharedUnlockEnabled: true, revision: 3 }; f.hint()
  await vi.waitFor(() => expect(lastState()).toMatchObject({ source: { organizationId: root.organizationId } }))
  const current = useAuthStore.getState(), authority = getSharedUnlockSourceSnapshot()
  expect(current.masterKey).toBe(initial.masterKey); expect(current.privateKey).toBe(initial.privateKey)
  expect(current.unlockLimits).toEqual(initial.unlockLimits); expect(current.cryptoSessionGeneration).toBe(initial.cryptoSessionGeneration)
  expect(authority.authorization).toEqual(before.authorization); expect(authority.sourceGeneration).toBe(before.sourceGeneration)
  expect(fetcher.mock.calls.every(([url, init]) => url === apiUrl + '/api/account/shared-unlock'
    && init?.method === 'GET' && new Headers(init.headers).get('authorization') === 'Bearer own-access')).toBe(true)
  expect(f.sent.some(message => message.payload.kind === 'preference-invalidated')).toBe(false)
})

it('uses a locked own JWT and does not clear the failed-save pause when the account becomes ON', async () => {
  expect(useAuthStore.getState().isVaultLocked).toBe(true)
  const pause = sharedUnlockPreferenceGate.pause(scope); await pause.persisted
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ sharedUnlockEnabled: true, revision: 4 })))
  vi.stubGlobal('fetch', fetcher)
  start()
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  expect(await sharedUnlockPreferenceGate.isAllowed(scope)).toBe(false)
  expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: true, masterKey: null, privateKey: null, accessToken: 'own-access' })
  await sharedUnlockPreferenceGate.complete(scope, pause.id, () => {})
})

it('rejects a delayed own preference after the real auth store changes accounts', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetcher)
  const observed = vi.fn(), unsubscribe = sharedUnlockPreferences.subscribe(observed); cleanup.push(unsubscribe)
  start(); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  useAuthStore.setState({ userId: '22222222-2222-4222-8222-222222222222', accessToken: 'next-access', refreshToken: 'next-refresh' })
  finish(new Response(JSON.stringify({ sharedUnlockEnabled: false, revision: 99 })))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(observed).not.toHaveBeenCalled(); expect(sharedUnlockPreferences.isDisabled(scope)).toBe(false)
  expect(useAuthStore.getState().accessToken).toBe('next-access')
})

it('connects explicit peer reconnect to the locked Web own JWT while preserving a failed preference save', async () => {
  const linkScope = { ...scope, webOrigin: 'https://web.test', extensionId: 'a'.repeat(32) }
  const linkId = '22222222-2222-4222-8222-222222222222'
  const revoked = { linkId, revision: 2, epoch: 2, state: 'revoked' as const, lastInvalidationSequence: 2, lastLogoutSequence: 0 }
  await sharedUnlockLinks.adopt(linkScope, linkId); await sharedUnlockLinks.observe(linkScope, revoked)
  await sharedUnlockPreferenceGate.pause(scope)
  const initial = useAuthStore.getState()
  const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).endsWith('/session-state') ? { action: 'none', link: null } : String(url).endsWith('/' + linkId)
    ? { ...revoked, state: 'locked', revision: 3, epoch: 3, lastInvalidationSequence: 3 }
    : { sharedUnlockEnabled: true, revision: 1 })))
  vi.stubGlobal('fetch', fetcher)
  const f = start(); await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
  f.emit({ attemptId: 'B'.repeat(42) + 'A', payload: { kind: 'link-reconnect', accountId: scope.accountId, linkId, reconnectRevision: 3 } })
  await vi.waitFor(() => expect(f.sent.some(message => message.payload.kind === 'link-reconnect-ack')).toBe(true))
  expect((await sharedUnlockLinks.read(linkScope))?.disconnectId).toBeNull()
  expect(await sharedUnlockPreferenceGate.isAllowed(scope)).toBe(false)
  expect(useAuthStore.getState()).toMatchObject({ userId: initial.userId, accessToken: initial.accessToken,
    cryptoSessionGeneration: initial.cryptoSessionGeneration, isVaultLocked: true, masterKey: null })
  expect(fetcher.mock.calls.every(([url, init]) => new Headers(init?.headers).get('authorization') === 'Bearer own-access'
    && (String(url).endsWith('/session-state') ? init?.method === 'POST' && init.body === JSON.stringify({ linkId, refreshToken: 'own-refresh' }) : init?.method === 'GET'))).toBe(true)
})

it('a rootless Web can select only a staged receiver link after a reconnect hint, keeping the latch and keys untouched', async () => {
  useAuthStore.setState({ accessToken: null, refreshToken: null })
  expect(await sharedUnlockPreferenceGate.isAllowed(scope)).toBe(true)
  const linkScope = { ...scope, webOrigin: 'https://web.test', extensionId: 'a'.repeat(32) }
  const linkId = '22222222-2222-4222-8222-222222222222'
  await sharedUnlockLinks.adopt(linkScope, linkId)
  const marker = await sharedUnlockLinks.observe(linkScope, { linkId, revision: 2, epoch: 2, state: 'revoked', lastInvalidationSequence: 2, lastLogoutSequence: 0 })
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetcher)
  const f = start()
  await vi.waitFor(() => expect(f.sent.some(message => message.payload.kind === 'state')).toBe(true))
  const first = f.sent.filter(message => message.payload.kind === 'state').at(-1)!.attemptId
  f.emit({ attemptId: 'B'.repeat(42) + 'A', payload: { kind: 'link-reconnect', accountId: scope.accountId, linkId, reconnectRevision: 3 } })
  await vi.waitFor(() => expect(f.sent.filter(message => message.payload.kind === 'state').at(-1)!.attemptId).not.toBe(first))
  const own = f.sent.filter(message => message.payload.kind === 'state').at(-1)!.attemptId, peerId = 'C'.repeat(42) + 'A'
  f.emit({ attemptId: peerId, payload: { kind: 'state', stateId: peerId, accountId: scope.accountId, status: 'unlocked',
    generation: 'D'.repeat(42) + 'A', source: { organizationId: root.organizationId } } })
  f.emit({ attemptId: peerId, payload: { kind: 'link', accountId: scope.accountId, linkId, webStateId: own, extensionStateId: peerId } })
  await vi.waitFor(() => expect(f.sent.some(message => message.payload.kind === 'link-selected')).toBe(true))
  expect((await sharedUnlockLinks.read(linkScope))?.disconnectId).toBe(marker.disconnectId)
  expect(useAuthStore.getState()).toMatchObject({ accessToken: null, masterKey: null, isVaultLocked: true })
  expect(fetcher).not.toHaveBeenCalled()
})

it('uses own Identity to log out an already-locked Web without a RAM unlock root', async () => {
  const linkId = '22222222-2222-4222-8222-222222222222'
  await sharedUnlockLinks.adopt({ ...scope, webOrigin: 'https://web.test', extensionId: 'a'.repeat(32) }, linkId)
  const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify(String(url).endsWith('/session-state')
    ? { action: 'logout', link: { linkId, revision: 3, epoch: 3, state: 'locked', lastInvalidationSequence: 3, lastLogoutSequence: 3 } }
    : { sharedUnlockEnabled: false, revision: 2 })))
  vi.stubGlobal('fetch', fetcher)
  expect(useAuthStore.getState().isVaultLocked).toBe(true)
  expect(getSharedUnlockSourceSnapshot().authorization).toBeNull()
  const f = start()
  await vi.waitFor(() => expect(useAuthStore.getState().userId).toBeNull())
  expect(useAuthStore.getState()).toMatchObject({ accessToken: null, refreshToken: null, masterKey: null, privateKey: null })
  expect(fetcher).toHaveBeenCalledWith(apiUrl + '/api/account/shared-unlock/session-state', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ linkId, refreshToken: 'own-refresh' }),
    headers: expect.objectContaining({ authorization: 'Bearer own-access' }),
  }))
  expect(f.sent.some(message => message.payload.kind === 'link-invalidated')).toBe(false)
})

it('does not apply a delayed closing read to a newer real Web login', async () => {
  const linkId = '22222222-2222-4222-8222-222222222222'
  await sharedUnlockLinks.adopt({ ...scope, webOrigin: 'https://web.test', extensionId: 'a'.repeat(32) }, linkId)
  let finish!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/session-state')
    ? new Promise(resolve => { finish = resolve }) : new Response(JSON.stringify({ sharedUnlockEnabled: true, revision: 1 })))
  vi.stubGlobal('fetch', fetcher); start()
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  useAuthStore.setState({ userId: '99999999-9999-4999-8999-999999999999', accessToken: 'next-access', refreshToken: 'next-refresh' })
  finish(new Response(JSON.stringify({ action: 'logout', link: null })))
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(useAuthStore.getState()).toMatchObject({ userId: '99999999-9999-4999-8999-999999999999', accessToken: 'next-access' })
})
