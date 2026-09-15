export const IDLE_TIMEOUT_MS = 15 * 60_000
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60_000

export interface SessionUnlockLimits {
  readonly unlockedAtMs: number
  readonly idleDeadlineMs: number
  readonly absoluteDeadlineMs: number
  readonly offlineDeadlineMs: number
}

export function sessionDeadline(limits: SessionUnlockLimits): number {
  return Math.min(limits.idleDeadlineMs, limits.absoluteDeadlineMs, limits.offlineDeadlineMs)
}

/** Apply Web's policy to the original unlock, including inherited authority. */
export function unlockLimits(now: number, inherited?: SessionUnlockLimits): SessionUnlockLimits {
  const unlockedAtMs = inherited?.unlockedAtMs ?? now
  const absoluteDeadlineMs = Math.min(unlockedAtMs + ABSOLUTE_TIMEOUT_MS, inherited?.absoluteDeadlineMs ?? Infinity)
  const result = {
    unlockedAtMs,
    idleDeadlineMs: Math.min(now + IDLE_TIMEOUT_MS, absoluteDeadlineMs, inherited?.idleDeadlineMs ?? Infinity),
    absoluteDeadlineMs,
    offlineDeadlineMs: Math.min(absoluteDeadlineMs, inherited?.offlineDeadlineMs ?? Infinity),
  }
  if (!Object.values(result).every(Number.isSafeInteger) || now < unlockedAtMs || now >= sessionDeadline(result)) throw new Error('Unlock session expired')
  return result
}
