import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { sharedUnlockLinks } from './link-runtime'
import { disconnectSharedUnlockLink, reconnectSharedUnlockLink } from './link-actions'

vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.test', sharedUnlockExtensionId: 'a'.repeat(32) } }))
const accountId = '11111111-1111-4111-8111-111111111111', linkId = '22222222-2222-4222-8222-222222222222'
const scope = { accountId, apiUrl: 'https://api.test', webOrigin: window.location.origin, extensionId: 'a'.repeat(32) }
const active = { linkId, revision: 2, epoch: 2, state: 'active' as const, lastInvalidationSequence: 0, lastLogoutSequence: 0 }
const revoked = { ...active, revision: 3, epoch: 3, state: 'revoked' as const, lastInvalidationSequence: 4 }
const reopened = { ...revoked, revision: 4, epoch: 4, state: 'locked' as const, lastInvalidationSequence: 5 }
const response = (body: unknown) => new Response(JSON.stringify(body))
const input = () => ({ accountId, linkId, generation: useAuthStore.getState().cryptoSessionGeneration })
async function disconnected() {
  const marker = await sharedUnlockLinks.beginClosing(scope, linkId, 'disconnect', 2, null)
  return sharedUnlockLinks.acknowledgeClosing(scope, linkId, marker.pending[0].id, revoked)
}
beforeEach(async () => {
  localStorage.clear()
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  useAuthStore.setState({ userId: accountId, accessToken: 'own-access', sessionId: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array([1, 2]), new Uint8Array([3, 4]))
  await sharedUnlockLinks.adopt(scope, linkId); await sharedUnlockLinks.observe(scope, active)
})
afterEach(async () => {
  vi.restoreAllMocks(); await sharedUnlockLinks.repair(scope)
  useAuthStore.getState().logout(); vi.unstubAllGlobals(); vi.useRealTimers()
})

it('locks locally before waits and revokes the own profile through own Identity even while sharing is OFF', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ sharedUnlockEnabled: false, revision: 8 }))
    .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(revoked))
  vi.stubGlobal('fetch', fetcher)
  const keys = useAuthStore.getState().masterKey!, work = disconnectSharedUnlockLink(input())
  expect([...keys]).toEqual([0, 0]); expect(useAuthStore.getState().isVaultLocked).toBe(true)
  await work
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([scope.apiUrl + '/api/account/shared-unlock',
    scope.apiUrl + '/api/account/shared-unlock/links/' + linkId, scope.apiUrl + '/api/account/shared-unlock/links/' + linkId + '/disconnect'])
  expect(fetcher.mock.calls[2][1]).toMatchObject({ headers: { authorization: 'Bearer own-access' } })
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).not.toBeNull()
  expect((await sharedUnlockLinks.read(scope))?.pending).toEqual([])
  expect(useAuthStore.getState().sessionId).toBe('own-refresh')
})

it('persists local revocation and keeps its own login on network failure', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')))
  await expect(disconnectSharedUnlockLink(input())).rejects.toThrow()
  expect((await sharedUnlockLinks.read(scope))?.pending).toMatchObject([{ action: 'disconnect' }])
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).not.toBeNull()
  expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: true, sessionId: 'own-refresh' })
})

it('revokes locally without an own JWT and does not invent backend authority', async () => {
  useAuthStore.setState({ accessToken: null })
  const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', fetcher)
  await expect(disconnectSharedUnlockLink(input())).rejects.toThrow()
  expect((await sharedUnlockLinks.read(scope))?.pending).toMatchObject([{ action: 'disconnect' }])
  expect(fetcher).not.toHaveBeenCalled(); expect(useAuthStore.getState().masterKey).toBeNull()
})

it('explicitly reconnects through own CAS, clears only its latch and locks for a fresh manual root', async () => {
  await disconnected()
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(revoked)).mockResolvedValueOnce(response(reopened))
  vi.stubGlobal('fetch', fetcher)
  await reconnectSharedUnlockLink(input())
  expect(fetcher.mock.calls[1][0]).toBe(scope.apiUrl + '/api/account/shared-unlock/links/' + linkId + '/reconnect')
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ expectedRevision: 3 })
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBeNull()
  expect(useAuthStore.getState()).toMatchObject({ masterKey: null, sessionId: 'own-refresh', isVaultLocked: true })
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/activate') || String(url).endsWith('/authorizations'))).toBe(false)
})

it('finishes an explicit local retry when Identity already reconnected without repeating that mutation', async () => {
  await disconnected()
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(reopened)); vi.stubGlobal('fetch', fetcher)
  await reconnectSharedUnlockLink(input())
  expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][1]?.method).toBe('GET')
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBeNull()
})

it('flushes a saved offline disconnect before reconnecting and never enables the account preference', async () => {
  await sharedUnlockLinks.beginClosing(scope, linkId, 'disconnect', 2, null)
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ sharedUnlockEnabled: false, revision: 8 }))
    .mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(revoked))
    .mockResolvedValueOnce(response(revoked)).mockResolvedValueOnce(response(reopened))
  vi.stubGlobal('fetch', fetcher)
  await reconnectSharedUnlockLink(input())
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url]) => String(url).split('/').at(-1)))
    .toEqual(['disconnect', 'reconnect'])
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  expect((await sharedUnlockLinks.read(scope))?.pending).toEqual([])
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBeNull()
})

it('keeps the revocation after a CAS conflict without guessing a new revision or retrying', async () => {
  const marker = await disconnected()
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(revoked)).mockResolvedValueOnce(new Response('{}', { status: 409 }))
  vi.stubGlobal('fetch', fetcher)
  await expect(reconnectSharedUnlockLink(input())).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBe(marker.disconnectId)
})

it('does not apply a late reconnect to a newer own session of the same account', async () => {
  const marker = await disconnected(); let finish!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(revoked)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetcher)
  const work = reconnectSharedUnlockLink(input()); const rejected = expect(work).rejects.toThrow()
  await vi.waitFor(() => expect(finish).toBeDefined())
  useAuthStore.getState().unlockVault(new Uint8Array([5]), new Uint8Array([6]))
  const next = useAuthStore.getState().masterKey
  finish(response(reopened)); await rejected
  expect(useAuthStore.getState().masterKey).toBe(next); expect([...next!]).toEqual([5])
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBe(marker.disconnectId)
})

it('keeps a newer disconnect decision when an old reconnect receipt arrives', async () => {
  await disconnected(); let finish!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(revoked)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetcher)
  const work = reconnectSharedUnlockLink(input()); const rejected = expect(work).rejects.toThrow()
  await vi.waitFor(() => expect(finish).toBeDefined())
  const newer = await sharedUnlockLinks.beginClosing(scope, linkId, 'disconnect', 3, null)
  finish(response(reopened)); await rejected
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBe(newer.disconnectId)
  expect((await sharedUnlockLinks.read(scope))?.pending).toMatchObject([{ action: 'disconnect' }])
})

it('rejects a stale UI action before wiping or changing the next account', async () => {
  const stale = input()
  useAuthStore.setState({ userId: '33333333-3333-4333-8333-333333333333' })
  const own = useAuthStore.getState().masterKey
  await expect(disconnectSharedUnlockLink(stale)).rejects.toThrow()
  expect(useAuthStore.getState().masterKey).toBe(own)
  expect((await sharedUnlockLinks.read(scope))?.disconnectId).toBeNull()
})
