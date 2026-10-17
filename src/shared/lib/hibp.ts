import { hibpSha1Hex } from '../crypto/digest'

/**
 * Have I Been Pwned — Pwned Passwords range check via k-anonymity.
 *
 * Zero-knowledge constraint: the password NEVER leaves the browser. We SHA-1
 * the candidate locally, send only the first 5 hex characters of the digest to
 * HIBP, and match the remaining suffix against the returned range ourselves.
 * With `Add-Padding` on, the response set is padded so the request size does
 * not leak how many real matches a prefix has.
 *
 * This is a UX signal (warn on a known-breached password), never a hard gate —
 * a network failure or HIBP outage must not block registration, so callers
 * treat `unknown` as "not breached".
 */
const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/'

export interface PwnedResult {
  /** true when the password appears in a known breach corpus. */
  pwned: boolean
  /** How many times it was seen (0 when not found or the lookup failed). */
  count: number
}

/**
 * Look up a password against HIBP. Returns `null` when the lookup could not be
 * completed (offline, aborted, HIBP down) so callers can distinguish "unknown"
 * from a confirmed "not breached" (`{ pwned: false }`).
 */
export async function checkPasswordPwned(
  password: string,
  signal?: AbortSignal,
): Promise<PwnedResult | null> {
  if (!password) return { pwned: false, count: 0 }

  try {
    const hash = hibpSha1Hex(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)

    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal,
    })
    if (!response.ok) return null

    const body = await response.text()
    for (const line of body.split('\n')) {
      const [lineSuffix, countText] = line.trim().split(':')
      if (lineSuffix === suffix) {
        const count = Number.parseInt(countText, 10)
        // Padded entries are returned with a count of 0 — treat those as "not found".
        if (count > 0) return { pwned: true, count }
        return { pwned: false, count: 0 }
      }
    }
    return { pwned: false, count: 0 }
  } catch {
    // Aborted, offline, or HIBP unavailable — signal "unknown" so registration
    // is never blocked by an advisory check.
    return null
  }
}
