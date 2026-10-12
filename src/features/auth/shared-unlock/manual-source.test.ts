import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { prepareManualSharedUnlock } from './manual-source'
import type { AccountResponse } from '../../../shared/api/account-api'

vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test' } }))
const account = { userId: 'account-a', kdf: { credentialRevision: 3, privateKeyWrapRevision: 5 } } as AccountResponse
const result = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  useAuthStore.getState().logout()
  useAuthStore.getState().setTokens({ accessToken: 'own-access', sessionId: 'own-refresh', userId: account.userId, isOnboarded: true })
  useAuthStore.getState().unlockVault(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4))
})
afterEach(() => { useAuthStore.getState().logout(); vi.unstubAllGlobals() })

for (const action of ['lockVault', 'expireSession', 'logout'] as const) {
  it(`immediately cancels preparation on real store ${action}`, async () => {
    let resolve!: (r: Response) => void
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(result({ sharedUnlockEnabled: true, revision: 3 }))
      .mockReturnValueOnce(new Promise(r => { resolve = r }))
    vi.stubGlobal('fetch', fetcher)
    const proof = new Uint8Array(32).fill(7)
    const preparing = prepareManualSharedUnlock(account, proof)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    useAuthStore.getState()[action]()
    expect(proof).toEqual(new Uint8Array(32))
    expect(fetcher.mock.lastCall![1]!.signal!.aborted).toBe(true)
    resolve(result({}))
    await preparing
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
    expect(useAuthStore.getState().masterKey).toBeNull()
  })
}

it('keeps the own unlocked session and keys after a sharing step-up failure', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(result({ sharedUnlockEnabled: false, revision: 3 }))
    .mockResolvedValueOnce(result({}, 403)))
  const before = useAuthStore.getState()
  const proof = new Uint8Array(32).fill(7)
  await prepareManualSharedUnlock(account, proof)
  expect(proof).toEqual(new Uint8Array(32))
  expect(useAuthStore.getState()).toMatchObject({ isVaultLocked: false, masterKey: before.masterKey,
    privateKey: before.privateKey, unlockLimits: before.unlockLimits, accessToken: 'own-access', sessionId: 'own-refresh' })
  const stored = JSON.parse(localStorage.getItem('palladin-auth')!).state
  expect(Object.keys(stored).sort()).toEqual(['emailVerified', 'isOnboarded', 'permissions', 'userId'])
})
