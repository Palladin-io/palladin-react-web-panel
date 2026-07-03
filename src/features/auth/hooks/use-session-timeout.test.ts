import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

import { useAuthStore } from '../stores/auth-store'
import { IDLE_TIMEOUT_MS, useSessionTimeout } from './use-session-timeout'

describe('useSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigateMock.mockClear()
    useAuthStore.getState().logout()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a no-op while the vault is locked', () => {
    renderHook(() => useSessionTimeout())

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS + 60_000)
    })

    expect(navigateMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('expires the session and routes to /unlock after the idle timeout', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      userId: 'u',
      isOnboarded: true,
    })
    useAuthStore
      .getState()
      .unlockVault(new Uint8Array([1]), new Uint8Array([2]))

    renderHook(() => useSessionTimeout())

    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS)
    })

    const state = useAuthStore.getState()
    expect(state.isVaultLocked).toBe(true)
    expect(state.accessToken).toBeNull()
    // Refresh token retained → session is still restorable.
    expect(state.refreshToken).toBe('refresh-1')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/unlock' })
  })
})
