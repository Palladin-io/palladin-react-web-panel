import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { sharedUnlockLinks } from '../shared-unlock/link-runtime'
import { lockClientSession } from './manual-lock'

vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.test', sharedUnlockExtensionId: 'a'.repeat(32) } }))
const accountId = '11111111-1111-4111-8111-111111111111', linkId = '22222222-2222-4222-8222-222222222222'
const scope = { accountId, apiUrl: 'https://api.test', webOrigin: window.location.origin, extensionId: 'a'.repeat(32) }
const active = { linkId, revision: 7, epoch: 3, state: 'active', lastInvalidationSequence: 0, lastLogoutSequence: 0 }
const reply = (body: unknown) => new Response(JSON.stringify(body))
beforeEach(async () => {
  localStorage.clear()
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline synthetic transport')))
  useAuthStore.setState({ userId: accountId, accessToken: 'own-access', refreshToken: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array([1, 2]), new Uint8Array([3, 4]))
  await sharedUnlockLinks.adopt(scope, linkId)
})
afterEach(async () => {
  vi.restoreAllMocks(); await sharedUnlockLinks.repair(scope)
  useAuthStore.getState().logout(); vi.unstubAllGlobals(); env.apiUrl = scope.apiUrl
})

it('wipes local keys synchronously, preserves its own login and persists offline lock for later repair', async () => {
  const own = useAuthStore.getState(), locking = lockClientSession()
  expect([...own.masterKey!]).toEqual([0, 0]); expect([...own.privateKey!]).toEqual([0, 0])
  expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: true, userId: accountId, accessToken: 'own-access', refreshToken: 'own-refresh' })
  await locking
  expect((await sharedUnlockLinks.read(scope))!.pending).toMatchObject([{ action: 'lock' }])
})

it('sends the actual lock with own JWT and fresh preference/link CAS, without shared logout', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(reply({ sharedUnlockEnabled: true, revision: 4 }))
    .mockResolvedValueOnce(reply(active))
    .mockResolvedValueOnce(reply({ ...active, revision: 8, epoch: 4, state: 'locked', lastInvalidationSequence: 9 }))
  vi.stubGlobal('fetch', fetcher)
  await lockClientSession()
  expect(fetcher.mock.calls[2][0]).toBe(`${scope.apiUrl}/api/account/shared-unlock/links/${linkId}/lock`)
  expect(fetcher.mock.calls[2][1]).toMatchObject({ headers: { authorization: 'Bearer own-access' }, credentials: 'omit', redirect: 'error' })
  expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ expectedRevision: 7, expectedPreferenceRevision: 4 })
  expect((await sharedUnlockLinks.read(scope))!.pending).toEqual([])
  expect(useAuthStore.getState().refreshToken).toBe('own-refresh')
})

it('keeps lock local when fresh own Identity says OFF', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ sharedUnlockEnabled: false, revision: 5 }))
  vi.stubGlobal('fetch', fetcher); await lockClientSession()
  expect(fetcher).toHaveBeenCalledOnce(); expect(fetcher.mock.calls[0][1]?.method).toBe('GET')
  expect((await sharedUnlockLinks.read(scope))!.pending).toEqual([])
  expect(useAuthStore.getState().isVaultLocked).toBe(true)
})

it('preserves local lock and admission denial when the closing cannot be saved', async () => {
  const set = localStorage.setItem.bind(localStorage)
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key.startsWith('palladin.shared-unlock.link.v1:')) throw new Error('disk')
    set(key, value)
  })
  await expect(lockClientSession()).rejects.toThrow('disk')
  expect(useAuthStore.getState()).toMatchObject({ masterKey: null, isVaultLocked: true, refreshToken: 'own-refresh' })
  await expect(sharedUnlockLinks.read(scope)).rejects.toThrow()
})

it.each([accountId, '33333333-3333-4333-8333-333333333333'])('does not complete a delayed lock over a new own session for %s or wipe its keys', async nextAccount => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve }))
  vi.stubGlobal('fetch', fetcher)
  const locking = lockClientSession()
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  useAuthStore.setState({ userId: nextAccount, accessToken: 'own-access', refreshToken: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array([5]), new Uint8Array([6]))
  const next = useAuthStore.getState()
  finish(reply({ sharedUnlockEnabled: true, revision: 4 })); await locking
  expect(fetcher).toHaveBeenCalledOnce()
  expect(useAuthStore.getState().masterKey).toBe(next.masterKey); expect([...next.masterKey!]).toEqual([5])
  expect((await sharedUnlockLinks.read(scope))!.pending).toMatchObject([{ action: 'lock' }])
})

it('does not turn ordinary peer/security lock into another shared event', async () => {
  useAuthStore.getState().lockVault()
  expect((await sharedUnlockLinks.read(scope))!.pending).toEqual([])
  expect(fetch).not.toHaveBeenCalled()
})

it('binds the pending record to the original API even if configuration changes while storage is waiting', async () => {
  let release!: () => void
  let delayed = false
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => {
    if (!delayed) { delayed = true; await new Promise<void>(resolve => { release = resolve }) }
    return action()
  } } })
  const locking = lockClientSession()
  await vi.waitFor(() => expect(release).toBeDefined())
  env.apiUrl = 'https://next-api.test'
  release()
  await locking
  expect((await sharedUnlockLinks.read(scope))!.pending).toMatchObject([{ action: 'lock' }])
  expect(fetch).not.toHaveBeenCalled()
})
