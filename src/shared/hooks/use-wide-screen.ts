import { useEffect, useState } from 'react'

/** Layout follows available CSS pixels, independently of control density. */
export const WIDE_LAYOUT_BREAKPOINT = 1280

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
