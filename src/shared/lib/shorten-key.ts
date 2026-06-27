/**
 * Shorten a long non-secret identifier (public key, agent/grant id, fingerprint)
 * to `{first N}…{last M}` — prefix AND suffix, never prefix-only — per the
 * root "Key & ID Display Standard".
 *
 * Use this whenever the client is handed a FULL non-secret value to display. If
 * the backend already returns a shortened hint (e.g. an agent `keyHint`), render
 * it as-is instead — don't double-shorten.
 *
 * Secret keys are NEVER shortened with this: those use the masked
 * `pl_••••{keySuffix}` form and the raw key never reaches the client.
 *
 * Values short enough that prefix + ellipsis + suffix wouldn't actually save
 * space are returned unchanged.
 */
export function shortenKey(value: string, prefix = 8, suffix = 6): string {
  if (prefix < 0 || suffix < 0) {
    throw new Error('shortenKey: prefix/suffix must be non-negative')
  }
  // No saving once the kept characters (+ the ellipsis) reach the full length.
  if (value.length <= prefix + suffix + 1) return value
  return `${value.slice(0, prefix)}…${value.slice(value.length - suffix)}`
}
