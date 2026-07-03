import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

import { useAuthStore } from '../stores/auth-store'
import {
  ABSOLUTE_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  useSessionTimeout,
} from './use-session-timeout'

function startUnlockedSession() {
  useAuthStore.getState().setTokens({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    userId: 'u',
    isOnboarded: true,
  })
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
}

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
    startUnlockedSession()

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

  it('resets the idle window on user activity so it does not expire while active', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())

    // Activity, then just under the idle threshold — repeated. Each activity
    // event pushes `lastActivity` forward, so the idle clock never elapses.
    act(() => {
      window.dispatchEvent(new Event('keydown'))
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
    })
    act(() => {
      window.dispatchEvent(new Event('mousedown'))
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
    })

    // 28 minutes of wall-clock elapsed, but never 15 idle → still unlocked.
    expect(navigateMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
    expect(useAuthStore.getState().accessToken).toBe('access-1')
  })

  it('expires at the absolute timeout even under continuous activity', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())

    // Stay active (5-min activity cadence, never idle) right up past 8 hours.
    // The absolute cap ignores activity and must still expire the session.
    for (
      let elapsed = 0;
      elapsed <= ABSOLUTE_TIMEOUT_MS;
      elapsed += 5 * 60_000
    ) {
      act(() => {
        window.dispatchEvent(new Event('keydown'))
        vi.advanceTimersByTime(5 * 60_000)
      })
    }

    expect(navigateMock).toHaveBeenCalledWith({ to: '/unlock' })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })
})
