import { deriveNonSecretStableId } from '../../../shared/crypto/non-secret-id'

const ACCEPTED_PERIOD_KEY = 'palladin:waitlist-developer-benefit-dialog-accepted'

export function isWaitlistDeveloperBenefitActive(
  startedAt: string | null | undefined,
  endsAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (typeof startedAt !== 'string' || typeof endsAt !== 'string') return false

  const startsAtMs = Date.parse(startedAt)
  const endsAtMs = Date.parse(endsAt)

  return Number.isFinite(startsAtMs)
    && Number.isFinite(endsAtMs)
    && startsAtMs <= now
    && startsAtMs < endsAtMs
    && endsAtMs > now
}

export function deriveWaitlistDeveloperBenefitPeriodId(
  userId: string,
  startedAt: string,
  endsAt: string,
): Promise<string> {
  return deriveNonSecretStableId(
    'palladin.waitlist-developer-benefit.period',
    userId,
    startedAt,
    endsAt,
  )
}

export function readWaitlistDeveloperBenefitAcknowledgement(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(ACCEPTED_PERIOD_KEY)
  } catch {
    return null
  }
}

export function writeWaitlistDeveloperBenefitAcknowledgement(periodId: string): void {
  try {
    window.sessionStorage.setItem(ACCEPTED_PERIOD_KEY, periodId)
  } catch {
    // Storage can be unavailable in hardened browser modes. Component state
    // still prevents the dialog from reopening during the current mount.
  }
}

export function clearWaitlistDeveloperBenefitAcknowledgement(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(ACCEPTED_PERIOD_KEY)
  } catch {
    // Session cleanup must continue even when browser storage is unavailable.
  }
}
