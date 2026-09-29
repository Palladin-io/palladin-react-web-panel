/** Approximate time remaining for display only; the server owns expiration. */
export function shareExpiryLabel(expiresAt: string, language: string, now = Date.now()): string | null {
  const remaining = Date.parse(expiresAt) - now
  if (!Number.isFinite(remaining) || remaining <= 0) return null
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  const [count, unit] = remaining >= 23 * hour
    ? [Math.max(1, Math.round(remaining / day)), 'day'] as const
    : remaining >= hour ? [Math.ceil(remaining / hour), 'hour'] as const
      : [Math.max(1, Math.ceil(remaining / minute)), 'minute'] as const
  return new Intl.RelativeTimeFormat(language, { numeric: 'always' }).format(count, unit)
}
