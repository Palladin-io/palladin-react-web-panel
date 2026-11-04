import { useEffect, useState } from 'react'

/** Remaining time until `deadline` (epoch ms) as `m:ss`; `null` once it has passed. */
export function useCountdown(deadline: number | null): string | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [deadline])
  if (deadline === null) return null
  const seconds = Math.ceil((deadline - now) / 1_000)
  if (seconds <= 0) return null
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
