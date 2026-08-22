import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useRouter: () => ({
    state: {
      location: {
        href: '/vaults/vault-1/entries/entry-1?tab=logs#history',
      },
    },
  }),
}))

import { useAuthStore } from '../stores/auth-store'
import {
  ABSOLUTE_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  useSessionTimeout,
} from './use-session-timeout'

function jwt(): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: 'u', org_id: 'org' })}.signature`
}

function startUnlockedSession() {
  useAuthStore.getState().setTokens({
    accessToken: jwt(),
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

  it('expires the session and routes to /unlock after the idle timeout', async () => {
    startUnlockedSession()

    renderHook(() => useSessionTimeout())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS)
    })

    const state = useAuthStore.getState()
    expect(state.isVaultLocked).toBe(true)
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBe('refresh-1')
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/unlock',
      search: {
        redirect: '/vaults/vault-1/entries/entry-1?tab=logs#history',
      },
    })
  })

  it('resets the idle window on user activity so it does not expire while active', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())

    act(() => {
      window.dispatchEvent(new Event('keydown'))
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
    })
    act(() => {
      window.dispatchEvent(new Event('mousedown'))
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
    })

    expect(navigateMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
    expect(useAuthStore.getState().accessToken).toBe(jwt())
  })

  it('expires at the absolute timeout even under continuous activity', async () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())

    for (
      let elapsed = 0;
      elapsed <= ABSOLUTE_TIMEOUT_MS;
      elapsed += 5 * 60_000
    ) {
      await act(async () => {
        window.dispatchEvent(new Event('keydown'))
        await vi.advanceTimersByTimeAsync(5 * 60_000)
      })
    }

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/unlock',
      search: {
        redirect: '/vaults/vault-1/entries/entry-1?tab=logs#history',
      },
    })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })
})
