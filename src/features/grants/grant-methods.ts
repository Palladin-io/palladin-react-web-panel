/**
 * Grant methods define how an agent's CLI may use a credential:
 *   - `get`    → returns the plaintext into the agent's context (LLM exposure)
 *   - `exec`   → injects the secret into a subprocess env (never enters the context)
 *   - `inject` → fills a browser login form (never enters the context)
 *
 * Backend `Grant.Methods` is a [Flags] enum; the API serialises a combined value as a
 * comma-separated camelCase string ("get, exec"). These helpers convert between that wire form and
 * the UI's string-array form.
 */
export const GRANT_METHOD_GET = 'get' as const
export const GRANT_METHOD_EXEC = 'exec' as const
export const GRANT_METHOD_INJECT = 'inject' as const

export const GRANT_METHODS = [GRANT_METHOD_GET, GRANT_METHOD_EXEC, GRANT_METHOD_INJECT] as const
export type GrantMethod = (typeof GRANT_METHODS)[number]

/** Default for a proactive grant: the privacy-preserving methods, `get` opted into deliberately. */
export const DEFAULT_GRANT_METHODS: GrantMethod[] = [GRANT_METHOD_EXEC, GRANT_METHOD_INJECT]

/** i18n key per method (label + description) — shared by the field and the badge. */
export const GRANT_METHOD_LABEL_KEY: Record<GrantMethod, string> = {
  get: 'grants.methods.getLabel',
  exec: 'grants.methods.execLabel',
  inject: 'grants.methods.injectLabel',
}

export const GRANT_METHOD_DESC_KEY: Record<GrantMethod, string> = {
  get: 'grants.methods.getDesc',
  exec: 'grants.methods.execDesc',
  inject: 'grants.methods.injectDesc',
}

/**
 * Parse the backend's combined-flags string ("get, exec") into a sorted, de-duplicated method list.
 * Tolerates casing/spacing and unknown tokens (skipped). Returns [] for null/empty so the UI can
 * fall back to a default or hide the badge.
 */
export function parseGrantMethods(raw: string | null | undefined): GrantMethod[] {
  if (!raw) return []
  const known = new Set<string>(GRANT_METHODS)
  const found = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => known.has(s)) as GrantMethod[]
  // De-duplicate and keep canonical order (get, exec, inject).
  return GRANT_METHODS.filter((m) => found.includes(m))
}

/**
 * Serialise the UI's method list to the backend wire form. PascalCase member names joined by ", "
 * (e.g. "Get, Exec") — System.Text.Json's flags converter accepts this for the [Flags] enum.
 */
export function serializeGrantMethods(methods: GrantMethod[]): string {
  const pascal: Record<GrantMethod, string> = { get: 'Get', exec: 'Exec', inject: 'Inject' }
  return GRANT_METHODS.filter((m) => methods.includes(m))
    .map((m) => pascal[m])
    .join(', ')
}

/** Frozen AAD uses the backend flags value as an unsigned 16-bit integer. */
export function grantMethodsMask(methods: readonly GrantMethod[]): number {
  const bits: Record<GrantMethod, number> = { get: 1, exec: 2, inject: 4 }
  return GRANT_METHODS.reduce((value, method) => value | (methods.includes(method) ? bits[method] : 0), 0)
}

export function grantMethodsFromMask(mask: number): GrantMethod[] {
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) return []
  const bits: Record<GrantMethod, number> = { get: 1, exec: 2, inject: 4 }
  return GRANT_METHODS.filter((method) => (mask & bits[method]) !== 0)
}
