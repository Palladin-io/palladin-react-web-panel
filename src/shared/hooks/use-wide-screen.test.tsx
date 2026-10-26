import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useWideScreen } from './use-wide-screen'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it.each([1280, 1512, 1521])('keeps laptop list and detail visible at %i CSS pixels', (width) => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width)
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: width >= Number(query.match(/\d+/)?.[0]),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
  const { result } = renderHook(() => useWideScreen())
  expect(result.current).toBe(true)
})

it('switches to drill-in on resize and removes its listener on unmount', () => {
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1512)
  let change: (event: { matches: boolean }) => void = () => {}
  const remove = vi.fn()
  vi.stubGlobal('matchMedia', () => ({ matches: true,
    addEventListener: (_: string, listener: typeof change) => { change = listener },
    removeEventListener: remove,
  }))
  const { result, unmount } = renderHook(() => useWideScreen())
  act(() => change({ matches: false }))
  expect(result.current).toBe(false)
  unmount()
  expect(remove).toHaveBeenCalledWith('change', change)
})
