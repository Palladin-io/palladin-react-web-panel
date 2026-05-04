import { describe, expect, it, beforeEach } from 'vitest'
import { useAuthStore, getIsAuthenticated } from './auth-store'

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.getState().logout()
  })

  it('has null initial state', () => {
    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.isOnboarded).toBe(false)
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
      refreshToken: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
      permissions: 7,
    })

    const state = useAuthStore.getState()
    expect(state.accessToken).toBe('access-123')
    expect(state.refreshToken).toBe('refresh-456')
    expect(state.userId).toBe('user-789')
    expect(state.isOnboarded).toBe(true)
    expect(state.permissions).toBe(7)
    expect(getIsAuthenticated()).toBe(true)
  })

  it('setTokens defaults permissions to 0 when omitted', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      userId: 'user-789',
      isOnboarded: false,
    })

    expect(useAuthStore.getState().permissions).toBe(0)
  })

  it('logout clears all values and becomes unauthenticated', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
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
    expect(state.refreshToken).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.isOnboarded).toBe(false)
    expect(state.permissions).toBe(0)
    expect(state.isVaultLocked).toBe(true)
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
    expect(getIsAuthenticated()).toBe(false)
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
      refreshToken: 'refresh-456',
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

  it('lockVault clears the keys but keeps the session', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      userId: 'user-789',
      isOnboarded: true,
    })
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1]), new Uint8Array([2]))

    useAuthStore.getState().lockVault()

    const state = useAuthStore.getState()
    expect(state.masterKey).toBeNull()
    expect(state.privateKey).toBeNull()
    expect(state.isVaultLocked).toBe(true)
    // Session is intact — user is still logged in.
    expect(state.accessToken).toBe('access-123')
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
})
