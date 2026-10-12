import { afterEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { sharedUnlockExpiry } from './expiry-runtime'
import { adoptSharedUnlockSource, getSharedUnlockSourceSnapshot, recordOwnSharedUnlockActivity } from './manual-source'
import fixtures from './fixtures/browser-session-api'
vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test', sharedUnlockExtensionId: '' } }))
const apiUrl = 'https://api.example.test'
afterEach(() => { useAuthStore.getState().logout(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('connects actual Web activity to its own Identity root without replacing keys or changing original hard limits', async () => {
  let now = fixtures.operations[0].sourceAuthorization.unlockedAtMs
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  const root = { ...fixtures.operations[0].sourceAuthorization, idleDeadlineMs: now + 1000, absoluteDeadlineMs: now + 10000, offlineDeadlineMs: now + 8000 }
  useAuthStore.setState({ userId: root.accountId, accessToken: 'own-access', sessionId: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4), root)
  const initial = useAuthStore.getState()
  adoptSharedUnlockSource(root, 'A'.repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => {
    if (useAuthStore.getState().cryptoSessionGeneration !== initial.cryptoSessionGeneration || useAuthStore.getState().isVaultLocked) throw new Error('own keys changed')
  })
  await sharedUnlockExpiry.checkpoint({ apiUrl, accountId: root.accountId }, root.sequence, root.idleDeadlineMs, root.offlineDeadlineMs)
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe(apiUrl + '/api/browser/account/shared-unlock/authorizations/activity')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer own-access')
    const input = JSON.parse(String(init?.body)); expect(input.expectedSessionId).toBe('own-refresh')
    return new Response(JSON.stringify({ ...root, idleDeadlineMs: input.idleDeadlineMs }))
  })
  vi.stubGlobal('fetch', fetcher)
  now += 100
  recordOwnSharedUnlockActivity(now)
  await vi.waitFor(() => expect(getSharedUnlockSourceSnapshot().authorization?.idleDeadlineMs).toBe(root.offlineDeadlineMs))
  expect(fetcher).toHaveBeenCalledOnce()
  const current = useAuthStore.getState()
  expect(current.masterKey).toBe(initial.masterKey); expect(current.privateKey).toBe(initial.privateKey)
  expect(current.cryptoSessionGeneration).toBe(initial.cryptoSessionGeneration)
  expect(current.unlockLimits).toMatchObject({ unlockedAtMs: root.unlockedAtMs, absoluteDeadlineMs: root.absoluteDeadlineMs, offlineDeadlineMs: root.offlineDeadlineMs })
  expect(await sharedUnlockExpiry.checkpoint({ apiUrl, accountId: root.accountId }, root.sequence, root.absoluteDeadlineMs, root.offlineDeadlineMs)).toBe(root.offlineDeadlineMs)
})

it('does not apply a delayed activity reply after the real Web session is locked', async () => {
  let now = fixtures.operations[0].sourceAuthorization.unlockedAtMs + 60_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  const root = { ...fixtures.operations[0].sourceAuthorization, unlockedAtMs: now, idleDeadlineMs: now + 1000, absoluteDeadlineMs: now + 10000, offlineDeadlineMs: now + 8000 }
  useAuthStore.setState({ userId: root.accountId, accessToken: 'own-access', sessionId: 'own-refresh' })
  useAuthStore.getState().unlockVault(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4), root)
  const initial = useAuthStore.getState()
  adoptSharedUnlockSource(root, 'C'.repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => {
    if (useAuthStore.getState().cryptoSessionGeneration !== initial.cryptoSessionGeneration || useAuthStore.getState().isVaultLocked) throw new Error('own keys changed')
  })
  await sharedUnlockExpiry.checkpoint({ apiUrl, accountId: root.accountId }, root.sequence, root.idleDeadlineMs, root.offlineDeadlineMs)
  let release!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { release = resolve }))
  vi.stubGlobal('fetch', fetcher)
  now += 100; recordOwnSharedUnlockActivity(now)
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  useAuthStore.getState().lockVault()
  expect(initial.masterKey?.every(value => value === 0)).toBe(true)
  release(new Response(JSON.stringify({ ...root, idleDeadlineMs: root.offlineDeadlineMs })))
  await Promise.resolve(); await Promise.resolve()
  expect(useAuthStore.getState().isVaultLocked).toBe(true)
  expect(getSharedUnlockSourceSnapshot().authorization).toBeNull()
  await expect(sharedUnlockExpiry.assertFresh({ apiUrl, accountId: root.accountId }, root.sequence)).rejects.toThrow('retired locally')
})
