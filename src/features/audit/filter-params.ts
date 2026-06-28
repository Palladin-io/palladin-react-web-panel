/**
 * Serialise a multi-select filter to a single CSV query param value
 * (`a,b,c`) — the backend reads these as an `IN (...)` filter. Empty selection
 * → `undefined` so the param is omitted entirely.
 */
export function csvParam(values: string[]): string | undefined {
  return values.length ? values.join(',') : undefined
}
