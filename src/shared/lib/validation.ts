export type Validator = (value: string) => string | null

export const required = (message: string): Validator =>
  (v) => v.trim().length > 0 ? null : message

export const maxLen = (n: number, message: string): Validator =>
  (v) => v.length <= n ? null : message

export const validUrl = (message: string): Validator =>
  (v) => {
    if (!v.trim()) return null
    try { new URL(v); return null }
    catch { return message }
  }

export function firstError(value: string, validators: Validator[]): string | null {
  for (const validate of validators) {
    const err = validate(value)
    if (err !== null) return err
  }
  return null
}
