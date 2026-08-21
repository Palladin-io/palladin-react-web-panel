import { useEffect, useState } from 'react'

/**
 * Comfortable-density equivalent of the former 1280px split-view threshold:
 * 1280 × 1.25 = 1600 physical CSS pixels at the app's 100% browser zoom.
 */
export const WIDE_LAYOUT_BREAKPOINT = 1600

/** Returns true when the viewport is at least `breakpoint` px wide. Uses matchMedia for efficiency. */
export function useWideScreen(breakpoint = WIDE_LAYOUT_BREAKPOINT): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return wide
}
