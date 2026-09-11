import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { sharedUnlockLinks } from '../shared-unlock/link-runtime'
import { clearClientSession, logoutAndReload } from './client-session'

vi.mock('../../../shared/lib/env', async importOriginal => ({
  ...await importOriginal<typeof import('../../../shared/lib/env')>(),
  env: { apiUrl: 'https://api.test', sharedUnlockExtensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
}))

const originalLocation = window.location
const originalLocks = navigator.locks
const accountId = '11111111-1111-4111-8111-111111111111'
const scope = { accountId, apiUrl: env.apiUrl, webOrigin: originalLocation.origin, extensionId: env.sharedUnlockExtensionId }
const linkId = '22222222-2222-4222-8222-222222222222'
let replace: ReturnType<typeof vi.fn>

beforeEach(async () => {
  localStorage.clear()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: async (_name: string, action: () => Promise<unknown>) => action(),
  } })
  replace = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { origin: originalLocation.origin, replace } })
  useAuthStore.getState().setTokens({ accessToken: 'own-access', refreshToken: 'own-refresh', userId: accountId, isOnboarded: true })
  useAuthStore.getState().unlockVault(new Uint8Array([1, 2]), new Uint8Array([3, 4]))
  await sharedUnlockLinks.adopt(scope, linkId)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await sharedUnlockLinks.repair(scope)
  useAuthStore.getState().logout()
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks })
})

describe('actual manual Web logout with a saved link', () => {
  it('persists a pending shared logout before reload while wiping keys immediately', async () => {
    const keys = useAuthStore.getState().masterKey!
    const logout = logoutAndReload()
    expect([...keys]).toEqual([0, 0])
    expect(useAuthStore.getState().userId).toBeNull()
    await logout
    expect((await sharedUnlockLinks.read(scope))!.pending).toMatchObject([{ action: 'logout' }])
    expect(replace).toHaveBeenCalledWith('/login')
  })
  it('does not convert generic auth failure cleanup into a shared logout', async () => {
    await clearClientSession()
    expect((await sharedUnlockLinks.read(scope))!.pending).toEqual([])
  })
  it('still wipes auth and saves closing when secondary cleanup throws synchronously', async () => {
    await logoutAndReload('/login', () => { throw new Error('secondary') })
    expect(useAuthStore.getState().masterKey).toBeNull()
    expect(useAuthStore.getState().userId).toBeNull()
    expect((await sharedUnlockLinks.read(scope))!.pending).toMatchObject([{ action: 'logout' }])
    expect(replace).toHaveBeenCalledWith('/login')
  })
  it('keeps local auth erased and does not reload when the closing record cannot be saved', async () => {
    const setItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith('palladin.shared-unlock.link.v1:')) throw new Error('disk')
      setItem(key, value)
    })
    await expect(logoutAndReload()).rejects.toThrow('disk')
    expect(useAuthStore.getState().userId).toBeNull()
    expect(useAuthStore.getState().masterKey).toBeNull()
    expect(replace).not.toHaveBeenCalled()
    await expect(sharedUnlockLinks.read(scope)).rejects.toThrow()
  })
})
