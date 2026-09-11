import { afterEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/auth-store'
import { sharedUnlockExpiry } from './expiry-runtime'
vi.mock('../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.example.test' } }))
const scope = { apiUrl: 'https://api.example.test', accountId: '11111111-1111-4111-8111-111111111111' }
afterEach(() => { useAuthStore.getState().logout(); localStorage.clear(); vi.unstubAllGlobals() })
it.each(['lockVault', 'expireSession', 'pagehide'] as const)('handles %s without retaining keys', async action => {
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => Promise<unknown>) => callback() } })
  useAuthStore.setState({ userId: scope.accountId })
  useAuthStore.getState().unlockVault(new Uint8Array(32).fill(7), new Uint8Array(32).fill(8))
  sharedUnlockExpiry.remember(scope, 5)
  const previous = useAuthStore.getState()
  if (action === 'pagehide') previous.expireSession('pagehide'); else previous[action]()
  expect(previous.masterKey?.every(value => value === 0)).toBe(true)
  expect(previous.privateKey?.every(value => value === 0)).toBe(true)
  expect(useAuthStore.getState().masterKey).toBeNull()
  if (action === 'pagehide') await expect(sharedUnlockExpiry.assertFresh(scope, 5)).resolves.toBeUndefined()
  else await expect(sharedUnlockExpiry.assertFresh(scope, 5)).rejects.toThrow('retired locally')
})
