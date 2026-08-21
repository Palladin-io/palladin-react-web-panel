import { HTTPError } from 'ky'

function containsExactValue(value: unknown, expected: string): boolean {
  if (value === expected) return true
  if (Array.isArray(value)) return value.some((item) => containsExactValue(item, expected))
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsExactValue(item, expected))
  }
  return false
}

/** Matches a structured backend error key without substring heuristics. */
export async function hasApiErrorKey(error: unknown, expected: string): Promise<boolean> {
  if (!(error instanceof HTTPError)) return false
  try {
    return containsExactValue(await error.response.clone().json(), expected)
  } catch {
    return false
  }
}
