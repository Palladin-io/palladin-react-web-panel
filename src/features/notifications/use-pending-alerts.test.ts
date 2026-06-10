import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePendingAlerts } from './use-pending-alerts'

// Force "tab hidden" so notifyPending flashes the title.
function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
  vi.spyOn(document, 'hasFocus').mockReturnValue(!hidden)
}

describe('usePendingAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.title = 'Claw Vault'
    setTabHidden(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('flashes the document title with the unseen count when the tab is hidden', () => {
    const { result } = renderHook(() => usePendingAlerts())

    act(() => result.current.notifyPending())
    // Title switches to the alert form (contains the count).
    expect(document.title).toContain('1')

    // After one interval it toggles back to the original title.
    act(() => vi.advanceTimersByTime(1000))
    expect(document.title).toBe('Claw Vault')

    // A second pending event bumps the count.
    act(() => result.current.notifyPending())
    expect(document.title).toContain('2')
  })

  it('reset() restores the original title and stops flashing', () => {
    const { result } = renderHook(() => usePendingAlerts())
    act(() => result.current.notifyPending())
    expect(document.title).not.toBe('Claw Vault')

    act(() => result.current.reset())
    expect(document.title).toBe('Claw Vault')

    // No further mutation once reset (timer cleared).
    act(() => vi.advanceTimersByTime(3000))
    expect(document.title).toBe('Claw Vault')
  })

  it('does not flash while the tab is focused (only counts)', () => {
    setTabHidden(false)
    const { result } = renderHook(() => usePendingAlerts())
    act(() => result.current.notifyPending())
    expect(document.title).toBe('Claw Vault')
  })

  it('does not throw when Web Audio is unavailable', () => {
    const original = window.AudioContext
    // @ts-expect-error — simulate a browser without Web Audio.
    delete window.AudioContext
    const { result } = renderHook(() => usePendingAlerts())
    expect(() => act(() => result.current.notifyPending())).not.toThrow()
    window.AudioContext = original
  })
})
