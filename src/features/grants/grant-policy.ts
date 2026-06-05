/**
 * Grant access policy — one of three mutually exclusive kinds:
 *   - `time`     → access expires at a chosen timestamp  (sends `expiresAt`)
 *   - `uses`     → access is capped at N retrievals        (sends `queryLimit`)
 *   - `lifetime` → access never expires                    (sends NEITHER field)
 *
 * The backend approve contract accepts at most one of `expiresAt` / `queryLimit`;
 * `lifetime` omits both.
 */
export type GrantPolicyKind = 'time' | 'uses' | 'lifetime'

/** Default selection in the approve dialog. */
export const DEFAULT_GRANT_POLICY_KIND: GrantPolicyKind = 'time'

/** i18n key per policy validation error code (shared by the grant dialogs). */
export const POLICY_ERROR_KEY: Record<string, string> = {
  expiryRequired: 'grants.approve.errorExpiryRequired',
  expiryInPast: 'grants.approve.errorExpiryInPast',
  limitRequired: 'grants.approve.errorLimitRequired',
  limitInvalid: 'grants.approve.errorLimitInvalid',
}

export interface GrantPolicyInput {
  kind: GrantPolicyKind
  /** ISO datetime-local string when kind === 'time'. */
  expiresAt: string
  /** Raw text input when kind === 'uses'. */
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
 * when valid. `lifetime` is always valid (no extra field). Pure — fully
 * unit-testable; `now` is injectable for determinism.
 */
export function validateGrantPolicy(
  input: GrantPolicyInput,
  now: Date = new Date(),
): GrantPolicyError {
  if (input.kind === 'lifetime') return null

  if (input.kind === 'time') {
    const raw = input.expiresAt.trim()
    if (!raw) return 'expiryRequired'
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return 'expiryRequired'
    if (date.getTime() <= now.getTime()) return 'expiryInPast'
    return null
  }

  // kind === 'uses'
  const raw = input.queryLimit.trim()
  if (!raw) return 'limitRequired'
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return 'limitInvalid'
  return null
}

/**
 * The XOR-or-none policy payload for the approve request:
 *   - time     → `{ expiresAt }`
 *   - uses     → `{ queryLimit }`
 *   - lifetime → `{}` (neither field; backend treats both-null as lifetime)
 *
 * Assumes {@link validateGrantPolicy} has already passed.
 */
export type GrantPolicyBody =
  | { expiresAt: string }
  | { queryLimit: number }
  | Record<string, never>

export function grantPolicyToBody(input: GrantPolicyInput): GrantPolicyBody {
  switch (input.kind) {
    case 'time':
      return { expiresAt: new Date(input.expiresAt.trim()).toISOString() }
    case 'uses':
      return { queryLimit: Number(input.queryLimit.trim()) }
    case 'lifetime':
      return {}
  }
}
