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

function startUnlockedSession() {
  useAuthStore.getState().setTokens({
    accessToken: 'access-1',
    sessionId: 'refresh-1',
    userId: 'u',
    isOnboarded: true,
  })
  useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]))
}

function trustedActivity(type: string) {
  const call = vi.mocked(window.addEventListener).mock.calls.findLast(([name]) => name === type)
  const handler = call?.[1] as EventListener
  handler({ isTrusted: true } as Event)
}

describe('useSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigateMock.mockClear()
    vi.spyOn(window, 'addEventListener')
    useAuthStore.getState().logout()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
    expect(state.sessionId).toBe('refresh-1')
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/unlock',
      search: {
        redirect: '/vaults/vault-1/entries/entry-1?tab=logs#history',
      },
    })
  })

  it('does not renew idle when the layout mounts again', () => {
    startUnlockedSession()
    const first = renderHook(() => useSessionTimeout())
    act(() => { vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000) })
    first.unmount()
    renderHook(() => useSessionTimeout())
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })

  it('expires inherited limits without starting a fresh local window', () => {
    startUnlockedSession()
    const now = Date.now()
    useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]), {
      unlockedAtMs: now - 60_000, idleDeadlineMs: now + 30_000,
      absoluteDeadlineMs: now + 60_000, offlineDeadlineMs: now + 90_000,
    })
    renderHook(() => useSessionTimeout())
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it.each(['idleDeadlineMs', 'absoluteDeadlineMs', 'offlineDeadlineMs'] as const)('wipes keys and access exactly at a sub-poll %s ceiling', ceiling => {
    startUnlockedSession()
    const now = Date.now()
    useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]), {
      unlockedAtMs: now, idleDeadlineMs: now + 60_000,
      absoluteDeadlineMs: now + 60_000, offlineDeadlineMs: now + 60_000,
      [ceiling]: now + 1_234,
    })
    const masterKey = useAuthStore.getState().masterKey!, privateKey = useAuthStore.getState().privateKey!
    renderHook(() => useSessionTimeout())
    act(() => { vi.advanceTimersByTime(1_233) })
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
    act(() => { vi.advanceTimersByTime(1) })
    expect(useAuthStore.getState()).toMatchObject({ masterKey: null, privateKey: null, accessToken: null, isVaultLocked: true })
    expect([...masterKey, ...privateKey].every(byte => byte === 0)).toBe(true)
    expect(navigateMock).toHaveBeenCalledOnce()
  })

  it('reschedules immediately when another unlocked generation has an earlier ceiling', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())
    act(() => {
      vi.advanceTimersByTime(5_000)
      const now = Date.now()
      useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]), {
        unlockedAtMs: now, idleDeadlineMs: now + 111,
        absoluteDeadlineMs: now + 10_000, offlineDeadlineMs: now + 10_000,
      })
      vi.advanceTimersByTime(111)
    })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })

  it('reschedules trusted idle renewal but keeps the inherited offline ceiling', () => {
    startUnlockedSession()
    const now = Date.now()
    useAuthStore.getState().unlockVault(new Uint8Array([1]), new Uint8Array([2]), {
      unlockedAtMs: now, idleDeadlineMs: now + 2_000,
      absoluteDeadlineMs: now + 60_000, offlineDeadlineMs: now + 4_321,
    })
    renderHook(() => useSessionTimeout())
    act(() => { vi.advanceTimersByTime(1_000); trustedActivity('keydown'); vi.advanceTimersByTime(1_000) })
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
    act(() => { vi.advanceTimersByTime(2_321) })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })

  it('ignores synthetic DOM activity', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())
    act(() => {
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
      window.dispatchEvent(new Event('keydown'))
      vi.advanceTimersByTime(60_000)
    })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })

  it('checks expiry on resume before waiting for the next poll', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())
    act(() => {
      vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS)
      window.dispatchEvent(new Event('pageshow'))
    })
    expect(useAuthStore.getState().isVaultLocked).toBe(true)
  })

  it('resets the idle window on user activity so it does not expire while active', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())

    act(() => {
      trustedActivity('keydown')
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
    })
    act(() => {
      trustedActivity('mousedown')
      vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 60_000)
    })

    expect(navigateMock).not.toHaveBeenCalled()
    expect(useAuthStore.getState().isVaultLocked).toBe(false)
    expect(useAuthStore.getState().accessToken).toBe('access-1')
  })

  it('expires at the absolute timeout even under continuous activity', () => {
    startUnlockedSession()
    renderHook(() => useSessionTimeout())

    for (
      let elapsed = 0;
      elapsed <= ABSOLUTE_TIMEOUT_MS;
      elapsed += 5 * 60_000
    ) {
      act(() => {
        trustedActivity('keydown')
        vi.advanceTimersByTime(5 * 60_000)
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
