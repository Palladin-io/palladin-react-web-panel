export type PasswordStrength = 0 | 1 | 2 | 3 | 4

export interface PasswordStrengthResult {
  score: PasswordStrength
  label: string
}

const MINIMUM_ACCEPTABLE_SCORE: PasswordStrength = 2

const STRENGTH_LABELS: Record<PasswordStrength, string> = {
  0: 'Too short',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
}

/**
 * Estimate master-password strength on a 0..4 scale. The rubric is
 * intentionally simple and deterministic so the UI feels responsive:
 * length contributes most, character-class variety fills in the rest.
 *
 * This is a UX signal, not a security gate — the real protection is
 * Argon2id's cost parameters applied to whatever the user picks.
 */
export function evaluatePasswordStrength(
  password: string,
): PasswordStrengthResult {
  if (password.length < 8) {
    return { score: 0, label: STRENGTH_LABELS[0] }
  }

  let score = 1
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1

  const classes = countCharacterClasses(password)
  if (classes >= 3) score += 1

  const clamped = Math.min(4, score) as PasswordStrength
  return { score: clamped, label: STRENGTH_LABELS[clamped] }
}

export function isPasswordAcceptable(score: PasswordStrength): boolean {
  return score >= MINIMUM_ACCEPTABLE_SCORE
}

function countCharacterClasses(password: string): number {
  let classes = 0
  if (/[a-z]/.test(password)) classes += 1
  if (/[A-Z]/.test(password)) classes += 1
  if (/[0-9]/.test(password)) classes += 1
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1
  return classes
}
