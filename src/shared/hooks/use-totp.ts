import { useEffect, useState } from 'react'
import { generateTotp, type TotpCode } from '../crypto/totp'
import type { TotpParams } from '../../features/vaults/types'

/**
 * Live TOTP code for a seed, recomputed every second so the countdown stays
 * accurate and the code auto-rolls at the window boundary. Returns null while
 * the first code is being generated or when `params` is null (no seed yet).
 *
 * The generation itself lives in `shared/crypto/totp.ts`; this hook is just the
 * React clock around it. Nothing is logged — the code is secret material.
 */
export function useTotp(params: TotpParams | null): TotpCode | null {
  const [code, setCode] = useState<TotpCode | null>(null)

  useEffect(() => {
    let cancelled = false

    // A 1s tick both refreshes the countdown and auto-rolls the code at the
    // window boundary (generateTotp derives the current window from the clock).
    // Clearing on an empty seed happens here (not synchronously in the effect
    // body) so there is no cascading-render setState during render.
    const tick = async () => {
      if (!params || !params.secret) {
        if (!cancelled) setCode(null)
        return
      }
      try {
        const next = await generateTotp(params)
        if (!cancelled) setCode(next)
      } catch {
        if (!cancelled) setCode(null)
      }
    }

    void tick()
    const interval = setInterval(tick, 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // Re-key on the seed identity; a new object with the same values recomputes,
    // which is fine (cheap) and avoids a deep-equality dependency.
  }, [params])

  return code
}
