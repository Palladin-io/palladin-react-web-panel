/**
 * Grant policy = exactly one of: an expiry timestamp (TTL) OR a usage limit.
 * The backend approve contract treats these as XOR — never both, never neither.
 */
export type GrantPolicyKind = 'expiry' | 'limit'

export interface GrantPolicyInput {
  kind: GrantPolicyKind
  /** ISO datetime-local string when kind === 'expiry'. */
  expiresAt: string
  /** Raw text input when kind === 'limit'. */
  queryLimit: string
}

export type GrantPolicyError =
  | 'expiryRequired'
  | 'expiryInPast'
  | 'limitRequired'
  | 'limitInvalid'
  | null

/**
 * Validates a policy input. Returns a specific error code (for i18n) or `null`
 * when valid. Pure — no side effects, fully unit-testable.
 *
 * `now` is injectable so tests are deterministic.
 */
export function validateGrantPolicy(
  input: GrantPolicyInput,
  now: Date = new Date(),
): GrantPolicyError {
  if (input.kind === 'expiry') {
    const raw = input.expiresAt.trim()
    if (!raw) return 'expiryRequired'
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return 'expiryRequired'
    if (date.getTime() <= now.getTime()) return 'expiryInPast'
    return null
  }

  // kind === 'limit'
  const raw = input.queryLimit.trim()
  if (!raw) return 'limitRequired'
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return 'limitInvalid'
  return null
}

/**
 * Maps a validated policy input to the XOR fields of the approve body.
 * Assumes {@link validateGrantPolicy} has already passed.
 */
export function grantPolicyToBody(
  input: GrantPolicyInput,
): { expiresAt: string } | { queryLimit: number } {
  if (input.kind === 'expiry') {
    return { expiresAt: new Date(input.expiresAt.trim()).toISOString() }
  }
  return { queryLimit: Number(input.queryLimit.trim()) }
}
