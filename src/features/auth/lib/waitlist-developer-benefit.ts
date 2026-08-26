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
