import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationItem } from './notifications-api'
import { NotificationCard } from './notification-card'

const SEEN_DELAY_MS = 600

// Captures the IntersectionObserver instances the card creates so a test can
// drive visibility manually and assert how many observers were spun up.
type FakeObserver = {
  trigger: (isIntersecting: boolean) => void
  disconnect: ReturnType<typeof vi.fn>
}

let observers: FakeObserver[] = []

class MockIntersectionObserver {
  private cb: IntersectionObserverCallback
  disconnect = vi.fn()
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    observers.push({
      trigger: (isIntersecting) =>
        this.cb(
          [{ isIntersecting } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      disconnect: this.disconnect,
    })
  }
  observe = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])
  root = null
  rootMargin = ''
  thresholds = []
}

const unreadItem: NotificationItem = {
  id: 'n1',
  type: 'grant_pending',
  category: 'actionRequired',
  titleKey: 'notifications.grantPending.title',
  metadata: {
    grantId: 'g1',
    vaultId: 'v1',
    entryId: 'e1',
    agentName: 'Deploy Bot',
    entryLabel: 'GitHub Token',
    vaultName: 'Production',
  },
  occurredAt: '2026-06-15T10:00:00Z',
  readAt: null,
  actionState: 'pending',
}

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('NotificationCard mark-read-on-view', () => {
  it('fires onSeen exactly once after the card stays visible for the delay', () => {
    const onSeen = vi.fn()
    render(<NotificationCard item={unreadItem} onSeen={onSeen} />)

    act(() => observers[0].trigger(true))
    expect(onSeen).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(SEEN_DELAY_MS))
    expect(onSeen).toHaveBeenCalledExactlyOnceWith('n1')
  })

  it('does not reset the timer on re-render when onSeen keeps a stable reference', () => {
    // Regression: passing an inline `(id) => mutate(id)` closure created a new
    // onSeen every render, landing in the card's useEffect deps and resetting
    // the timer. A stable reference (e.g. TanStack's `mutate`) must let the
    // timer run to completion across parent re-renders.
    const onSeen = vi.fn()
    const { rerender } = render(<NotificationCard item={unreadItem} onSeen={onSeen} />)

    act(() => observers[0].trigger(true))

    // Half-way through the delay the parent re-renders with the SAME onSeen.
    act(() => vi.advanceTimersByTime(SEEN_DELAY_MS / 2))
    rerender(<NotificationCard item={unreadItem} onSeen={onSeen} />)

    // No new observer was created — the effect did not re-run.
    expect(observers).toHaveLength(1)

    // Finishing the original delay still fires onSeen once.
    act(() => vi.advanceTimersByTime(SEEN_DELAY_MS / 2))
    expect(onSeen).toHaveBeenCalledExactlyOnceWith('n1')
  })

  it('resets the timer when a new onSeen closure is passed every render', () => {
    // Demonstrates the bug the fix avoids: an unstable onSeen re-runs the effect
    // (new observer) and the previous in-flight timer is cleared, so the card is
    // never marked read despite staying visible.
    const mutate = vi.fn()
    const { rerender } = render(
      <NotificationCard item={unreadItem} onSeen={(id) => mutate(id)} />,
    )

    act(() => observers[0].trigger(true))
    act(() => vi.advanceTimersByTime(SEEN_DELAY_MS / 2))

    // New closure → effect re-runs → fresh observer, old timer cleared.
    rerender(<NotificationCard item={unreadItem} onSeen={(id) => mutate(id)} />)
    expect(observers).toHaveLength(2)

    // The remaining time elapses but the fresh observer never saw visibility.
    act(() => vi.advanceTimersByTime(SEEN_DELAY_MS / 2))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('skips the observer entirely for already-read cards', () => {
    const onSeen = vi.fn()
    render(
      <NotificationCard
        item={{ ...unreadItem, readAt: '2026-06-15T11:00:00Z' }}
        onSeen={onSeen}
      />,
    )
    expect(observers).toHaveLength(0)
  })
})
