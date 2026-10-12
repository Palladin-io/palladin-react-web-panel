import { describe, expect, it, beforeEach } from 'vitest'
import { useAuthStore, getIsAuthenticated } from './auth-store'

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
  })

  it('keeps keys, lock state and inherited limits outside storage restoration', async () => {
    useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
    const written = JSON.parse(localStorage.getItem('palladin-auth')!).state
    expect(written).not.toHaveProperty('unlockLimits')
    useAuthStore.getState().logout()
    localStorage.setItem('palladin-auth', JSON.stringify({ version: 0, state: {
      sessionId: 'synthetic-refresh', userId: 'u', accessToken: 'synthetic-stale-access',
      isVaultLocked: false, masterKey: [1], privateKey: [2],
      unlockLimits: { unlockedAtMs: 1, idleDeadlineMs: Number.MAX_SAFE_INTEGER },
    } }))
    await useAuthStore.persist.rehydrate()
    const state = useAuthStore.getState()
    expect(state.sessionId).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
    expect(state.isVaultLocked).toBe(true)
    expect(state.unlockLimits).toBeNull()
  })

  it('never persists a supplied refresh token or trusts persisted session identity', async () => {
    const responseWithExtraField = { accessToken: 'synthetic-access', sessionId: 'synthetic-session',
      refreshToken: 'synthetic-secret', userId: 'u', isOnboarded: true }
    useAuthStore.getState().setTokens(responseWithExtraField)
    expect(localStorage.getItem('palladin-auth')).not.toContain('synthetic-secret')
    useAuthStore.getState().logout()
    localStorage.setItem('palladin-auth', JSON.stringify({ state: {
      refreshToken: 'legacy-secret', sessionId: 'forged-session', userId: 'u', accessToken: 'forged-access',
    }, version: 0 }))
    await useAuthStore.persist.rehydrate()
    expect(getIsAuthenticated()).toBe(false)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('does not install expired inherited keys or revive idle with late activity', () => {
    const now = Date.now()
    expect(() => useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]), {
      unlockedAtMs: now - 1000, idleDeadlineMs: now - 1,
      absoluteDeadlineMs: now + 1000, offlineDeadlineMs: now + 1000,
    })).toThrow('Unlock session expired')
    expect(useAuthStore.getState().masterKey).toBeNull()
    useAuthStore.getState().recordActivity(now)
    expect(useAuthStore.getState().unlockLimits).toBeNull()
  })

  it('has null initial state', () => {
    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.sessionId).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.isOnboarded).toBe(false)
    expect(state.waitlistDeveloperBenefitStartedAt).toBeNull()
    expect(state.waitlistDeveloperBenefitEndsAt).toBeNull()
    expect(state.permissions).toBe(0)
    expect(state.isVaultLocked).toBe(true)
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
  })

  it('is not authenticated initially', () => {
    expect(getIsAuthenticated()).toBe(false)
  })

  it('setTokens sets all values and becomes authenticated', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      permissions: 7,
    })

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('access-123')
    expect(state.sessionId).toBe('refresh-456')
    expect(state.userId).toBe('user-789')
    expect(state.isOnboarded).toBe(true)
    expect(state.permissions).toBe(7)
    expect(getIsAuthenticated()).toBe(true)
  })

  it('setTokens defaults permissions to 0 when omitted', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: false,
    })

    expect(useAuthStore.getState().permissions).toBe(0)
  })

  it('logout clears all values and becomes unauthenticated', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      permissions: 7,
    })
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]))

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.sessionId).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.isOnboarded).toBe(false)
    expect(state.permissions).toBe(0)
    expect(state.isVaultLocked).toBe(true)
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
    expect(getIsAuthenticated()).toBe(false)
  })

  it('setTokens does not regress isOnboarded from true to false', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
    })
    expect(useAuthStore.getState().isOnboarded).toBe(true)

    // Simulate a token refresh where backend returns isOnboarded: false (stale JWT claim).
    useAuthStore.getState().setTokens({
      accessToken: 'access-new',
      sessionId: 'refresh-new',
      userId: 'user-789',
      isOnboarded: false,
    })

    expect(useAuthStore.getState().isOnboarded).toBe(true)
  })

  it('setTokens does not change vault lock state (token refresh stays unlocked)', () => {
    // Unlock first, then simulate a silent token refresh. The vault must
    // stay unlocked — the user should not be forced to re-enter their master
    // password just because the access token expired mid-session.
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]))
    expect(useAuthStore.getState().isVaultLocked).toBe(false)

    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
    })

    expect(useAuthStore.getState().isVaultLocked).toBe(false)
  })

  it('unlockVault stores independent copies of the key material', () => {
    const mk = new Uint8Array([1, 2, 3, 4])
    const pk = new Uint8Array([9, 8, 7, 6])

    useAuthStore.getState().unlockVault(mk, pk)

    // Zero out the source buffers — the store's copies should be unaffected.
    mk.fill(0)
    pk.fill(0)

    const state = useAuthStore.getState()
    expect(state.isVaultLocked).toBe(false)
    expect(Array.from(state.masterKey!)).toEqual([1, 2, 3, 4])
    expect(Array.from(state.privateKey!)).toEqual([9, 8, 7, 6])
  })

  it('changes the crypto cache namespace for every unlock, lock and logout', () => {
    const initialGeneration = useAuthStore.getState().cryptoSessionGeneration

    useAuthStore.getState().unlockVault(
      new Uint8Array([1]),
      new Uint8Array([2]),
    )
    const firstUnlockGeneration = useAuthStore.getState().cryptoSessionGeneration
    expect(firstUnlockGeneration).toBe(initialGeneration + 1)

    useAuthStore.getState().lockVault()
    useAuthStore.getState().unlockVault(
      new Uint8Array([3]),
      new Uint8Array([4]),
    )
    expect(useAuthStore.getState().cryptoSessionGeneration).toBe(
      firstUnlockGeneration + 2,
    )

    const beforeLogout = useAuthStore.getState().cryptoSessionGeneration
    useAuthStore.getState().logout()
    expect(useAuthStore.getState().cryptoSessionGeneration).toBe(
      beforeLogout + 1,
    )
  })

  it('lockVault clears the keys but keeps the session', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
    })
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1]), new Uint8Array([2]))
    const masterKey = useAuthStore.getState().masterKey!
    const privateKey = useAuthStore.getState().privateKey!

    useAuthStore.getState().lockVault()

    const state = useAuthStore.getState()
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
    expect(Array.from(masterKey)).toEqual([0])
    expect(Array.from(privateKey)).toEqual([0])
    expect(state.isVaultLocked).toBe(true)
    // Session is intact — user is still logged in.
    expect(state.accessToken).toBe('access-123')
  })

  it('expireSession wipes keys + access token but keeps the refresh token', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
    })
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1]), new Uint8Array([2]))
    const masterKey = useAuthStore.getState().masterKey!
    const privateKey = useAuthStore.getState().privateKey!

    useAuthStore.getState().expireSession()

    const state = useAuthStore.getState()
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
    expect(Array.from(masterKey)).toEqual([0])
    expect(Array.from(privateKey)).toEqual([0])
    expect(state.isVaultLocked).toBe(true)
    // Access token dropped from memory, refresh token retained so the session
    // is still silently restorable.
    expect(state.accessToken).toBeNull()
    expect(state.sessionId).toBe('refresh-456')
    expect(getIsAuthenticated()).toBe(true)
  })

  it('markOnboarded leaves the vault lock state untouched', () => {
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1]), new Uint8Array([2]))
    expect(useAuthStore.getState().isVaultLocked).toBe(false)

    useAuthStore.getState().markOnboarded()

    const state = useAuthStore.getState()
    expect(state.isOnboarded).toBe(true)
    expect(state.isVaultLocked).toBe(false)
  })

  it('setTokens reflects emailVerified from the response body', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      emailVerified: false,
    })
    expect(useAuthStore.getState().emailVerified).toBe(false)
  })

  it('does not regress emailVerified from true to false on a stale refresh', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      emailVerified: true,
    })
    expect(useAuthStore.getState().emailVerified).toBe(true)

    // A later refresh omits / regresses the flag — the banner must not resurrect.
    useAuthStore.getState().setTokens({
      accessToken: 'access-new',
      sessionId: 'refresh-new',
      userId: 'user-789',
      isOnboarded: true,
      emailVerified: false,
    })
    expect(useAuthStore.getState().emailVerified).toBe(true)
  })

  it('markEmailVerified flips the flag to true', () => {
    expect(useAuthStore.getState().emailVerified).toBe(false)
    useAuthStore.getState().markEmailVerified()
    expect(useAuthStore.getState().emailVerified).toBe(true)
  })

  it('keeps an active waitlist Developer period in memory only', () => {
    localStorage.clear()
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      waitlistDeveloperBenefitStartedAt: '2026-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2099-09-25T12:00:00Z',
    })

    const state = useAuthStore.getState()
    expect(state.waitlistDeveloperBenefitStartedAt).toBe('2026-08-25T12:00:00Z')
    expect(state.waitlistDeveloperBenefitEndsAt).toBe('2099-09-25T12:00:00Z')

    const persisted = JSON.parse(localStorage.getItem('palladin-auth')!) as {
      state: Record<string, unknown>
    }
    expect(persisted.state).not.toHaveProperty('waitlistDeveloperBenefitStartedAt')
    expect(persisted.state).not.toHaveProperty('waitlistDeveloperBenefitEndsAt')
  })

  it('drops an expired or incomplete waitlist Developer period', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      waitlistDeveloperBenefitStartedAt: '2020-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2020-09-25T12:00:00Z',
    })

    expect(useAuthStore.getState().waitlistDeveloperBenefitStartedAt).toBeNull()
    expect(useAuthStore.getState().waitlistDeveloperBenefitEndsAt).toBeNull()
  })

  it('can apply the verified active benefit without replacing session tokens', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
    })

    useAuthStore.getState().setWaitlistDeveloperBenefit(
      '2026-08-25T12:00:00Z',
      '2099-09-25T12:00:00Z',
    )

    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-123',
      sessionId: 'refresh-456',
      waitlistDeveloperBenefitStartedAt: '2026-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2099-09-25T12:00:00Z',
    })
  })
})
