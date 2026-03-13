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

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
    expect(state.userId).toBeNull()
    expect(state.isOnboarded).toBe(false)
    expect(state.permissions).toBe(0)
    expect(getIsAuthenticated()).toBe(false)
  })
})
