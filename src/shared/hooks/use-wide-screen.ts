import { useEffect, useState } from 'react'

/** Returns true when the viewport is at least `breakpoint` px wide. Uses matchMedia for efficiency. */
export function useWideScreen(breakpoint = 1280): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const handler = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return wide
}
