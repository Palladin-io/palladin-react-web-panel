import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from './auth-store'

const now = 1800000000000
const prior = { accessToken: 'old-own-access', refreshToken: 'old-own-refresh', userId: 'account-a', isOnboarded: true }
const received = { ...prior, accessToken: 'new-own-access', refreshToken: 'new-own-refresh' }
const limits = { unlockedAtMs: now - 100000, idleDeadlineMs: now + 20000,
  absoluteDeadlineMs: now + 40000, offlineDeadlineMs: now + 30000 }
const pending = () => ({
  expected: { ...useAuthStore.getState() }, accountId: prior.userId, session: received,
  keys: { masterKey: new Uint8Array(32).fill(11), privateKey: new Uint8Array(32).fill(22) }, limits,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  useAuthStore.getState().logout()
  useAuthStore.getState().setTokens(prior)
})
afterEach(() => { vi.restoreAllMocks(); useAuthStore.getState().logout(); vi.useRealTimers() })

describe('own shared-unlock session publication', () => {
  it('publishes independent keys and own tokens together, preserving original age and deadlines', () => {
    const input = pending()
    const observed: boolean[] = []
    const unsubscribe = useAuthStore.subscribe(state => {
      if (state.refreshToken === received.refreshToken) observed.push(!state.isVaultLocked && state.masterKey?.[0] === 11 && state.privateKey?.[0] === 22)
    })
    try {
      const generation = useAuthStore.getState().installSharedUnlock(input)
      input.keys.masterKey.fill(0); input.keys.privateKey.fill(0)
      expect(observed).toEqual([true])
      expect(useAuthStore.getState()).toMatchObject({ ...received, isVaultLocked: false, unlockLimits: limits, cryptoSessionGeneration: generation })
      expect(useAuthStore.getState().masterKey?.[0]).toBe(11)
      expect(useAuthStore.getState().privateKey?.[0]).toBe(22)
      expect(Object.keys(JSON.parse(localStorage.getItem('palladin-auth')!).state).sort()).toEqual(
        ['emailVerified', 'isOnboarded', 'permissions', 'refreshToken', 'userId'])
      expect(JSON.parse(localStorage.getItem('palladin-auth')!).state.refreshToken).toBe(received.refreshToken)
    } finally { unsubscribe() }
  })

  it('can log in an anonymous receiver, without inheriting prior account presentation', () => {
    useAuthStore.getState().logout()
    const input = pending()
    input.session = { ...received, isOnboarded: false }
    useAuthStore.getState().installSharedUnlock(input)
    expect(useAuthStore.getState()).toMatchObject({ userId: prior.userId, isOnboarded: false, isVaultLocked: false })
  })

  for (const change of ['lock', 'expire', 'logout', 'account', 'refresh', 'unlock'] as const) {
    it(`rejects a late installation after ${change}, preserving the newer state`, () => {
      const input = pending()
      const store = useAuthStore.getState()
      if (change === 'lock') store.lockVault()
      if (change === 'expire') store.expireSession()
      if (change === 'logout') store.logout()
      if (change === 'account') store.setTokens({ ...prior, userId: 'account-b' })
      if (change === 'refresh') store.setTokens({ ...prior, refreshToken: 'rotated-own-refresh' })
      if (change === 'unlock') store.unlockVault(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4))
      const current = useAuthStore.getState()
      expect(() => current.installSharedUnlock(input)).toThrow('cancelled')
      expect(useAuthStore.getState()).toBe(current)
    })
  }

  for (const field of ['idleDeadlineMs', 'absoluteDeadlineMs', 'offlineDeadlineMs'] as const) {
    it(`does not expose newly minted tokens or keys at the exact ${field}`, () => {
      const input = pending()
      input.limits = { ...limits, [field]: now }
      const current = useAuthStore.getState()
      expect(() => current.installSharedUnlock(input)).toThrow('expired')
      expect(useAuthStore.getState()).toBe(current)
    })
  }

  it('rejects a different selected account and a commit for a different account', () => {
    for (const variant of ['selected', 'commit']) {
      const input = pending()
      if (variant === 'selected') input.accountId = 'account-b'
      else input.session = { ...received, userId: 'account-b' }
      expect(() => useAuthStore.getState().installSharedUnlock(input)).toThrow('cancelled')
      expect(useAuthStore.getState()).toMatchObject({ ...prior, isVaultLocked: true, masterKey: null })
    }
  })

  it('does not renew or wipe the live keys on a duplicate installation', () => {
    const input = pending()
    useAuthStore.getState().installSharedUnlock(input)
    const current = useAuthStore.getState()
    expect(() => current.installSharedUnlock({ ...input, keys: { masterKey: current.masterKey!, privateKey: current.privateKey! } })).toThrow('cancelled')
    expect(useAuthStore.getState()).toBe(current)
    expect(current.masterKey?.[0]).toBe(11)
  })

  it('wipes published copies and restores the previous own locked session if persistence fails', () => {
    const input = pending()
    let exposedKey: Uint8Array | null = null
    const unsubscribe = useAuthStore.subscribe(state => { if (state.masterKey) exposedKey = state.masterKey })
    const realSet = localStorage.setItem
    const writes = vi.spyOn(localStorage, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (value.includes(received.refreshToken)) throw new Error('storage unavailable')
      return realSet.call(this, key, value)
    })
    try {
      expect(() => useAuthStore.getState().installSharedUnlock(input)).toThrow('storage unavailable')
      expect(exposedKey).toEqual(new Uint8Array(32))
      expect(useAuthStore.getState()).toMatchObject({ ...prior, isVaultLocked: true, masterKey: null, privateKey: null, unlockLimits: null })
      expect(JSON.parse(localStorage.getItem('palladin-auth')!).state.refreshToken).toBe(prior.refreshToken)
      expect(writes).toHaveBeenCalledTimes(2)
    } finally { unsubscribe() }
  })

  it('erases installed keys and restores the prior session when a subscriber throws', () => {
    let exposedKey: Uint8Array | null = null
    const unsubscribe = useAuthStore.subscribe(state => {
      if (!state.masterKey) return
      exposedKey = state.masterKey
      throw new Error('observer failed')
    })
    try {
      expect(() => useAuthStore.getState().installSharedUnlock(pending())).toThrow('observer failed')
      expect(exposedKey).toEqual(new Uint8Array(32))
      expect(useAuthStore.getState()).toMatchObject({ ...prior, masterKey: null, privateKey: null, isVaultLocked: true })
    } finally { unsubscribe() }
  })

  for (const action of ['lockVault', 'expireSession', 'logout', 'other-login'] as const) {
    it(`respects ${action} from a synchronous session observer`, () => {
      const input = pending()
      let reacted = false
      let exposedKey: Uint8Array | null = null
      const unsubscribe = useAuthStore.subscribe(state => {
        if (reacted || state.refreshToken !== received.refreshToken) return
        reacted = true; exposedKey = state.masterKey
        if (action === 'other-login') {
          state.logout()
          useAuthStore.getState().setTokens({ ...prior, userId: 'account-b', refreshToken: 'other-own-refresh' })
        } else state[action]()
      })
      try {
        expect(() => useAuthStore.getState().installSharedUnlock(input)).toThrow('cancelled')
        expect(exposedKey).toEqual(new Uint8Array(32))
        const current = useAuthStore.getState()
        expect(current).toMatchObject({ isVaultLocked: true, masterKey: null, privateKey: null })
        expect(current.refreshToken).toBe(action === 'logout' ? null : action === 'other-login' ? 'other-own-refresh' : prior.refreshToken)
        if (action === 'expireSession') expect(current.accessToken).toBeNull()
      } finally { unsubscribe() }
    })
  }
})
