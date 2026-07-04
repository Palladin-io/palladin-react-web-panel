import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInfiniteScroll } from './use-infinite-scroll'

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void

let observerCallback: ObserverCallback | null = null
const observe = vi.fn()
const disconnect = vi.fn()

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback
  }
  observe = observe
  disconnect = disconnect
}

function renderInfiniteScroll(options: { onLoadMore: () => void; enabled: boolean }) {
  return renderHook(
    (props: { onLoadMore: () => void; enabled: boolean }) => {
      const ref = useRef(document.createElement('div'))
      useInfiniteScroll(ref, props)
    },
    { initialProps: options },
  )
}

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    observerCallback = null
    observe.mockClear()
    disconnect.mockClear()
  })

  it('fires onLoadMore when the sentinel intersects', () => {
    const onLoadMore = vi.fn()
    renderInfiniteScroll({ onLoadMore, enabled: true })

    expect(observe).toHaveBeenCalledTimes(1)
    observerCallback?.([{ isIntersecting: true }])
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('does not fire when the sentinel is not intersecting', () => {
    const onLoadMore = vi.fn()
    renderInfiniteScroll({ onLoadMore, enabled: true })

    observerCallback?.([{ isIntersecting: false }])
    expect(onLoadMore).not.toHaveBeenCalled()
  })

  it('does not observe while disabled', () => {
    renderInfiniteScroll({ onLoadMore: vi.fn(), enabled: false })
    expect(observe).not.toHaveBeenCalled()
  })

  it('disconnects the observer when disabled after being enabled', () => {
    const { rerender } = renderInfiniteScroll({ onLoadMore: vi.fn(), enabled: true })
    expect(observe).toHaveBeenCalledTimes(1)

    rerender({ onLoadMore: vi.fn(), enabled: false })
    expect(disconnect).toHaveBeenCalled()
  })

  it('is a no-op when IntersectionObserver is unavailable', () => {
    vi.unstubAllGlobals()
    const onLoadMore = vi.fn()
    expect(() => renderInfiniteScroll({ onLoadMore, enabled: true })).not.toThrow()
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})
