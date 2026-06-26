import type { PasswordStrength } from '../lib/password-strength'

export interface PasswordStrengthBarProps {
  score: PasswordStrength
}

/**
 * Four-segment horizontal bar that visualises password strength (0..4).
 * Filled segments share a single colour that depends on the overall score;
 * empty segments use the subtle base tone so the control reads as neutral
 * when the user hasn't typed anything yet.
 */
export function PasswordStrengthBar({ score }: PasswordStrengthBarProps) {
  const filledClass = colorForScore(score)
  return (
    <div className="mt-1.5 flex gap-1">
      {[1, 2, 3, 4].map((segment) => (
        <div
          key={segment}
          className={
            'h-1 flex-1 rounded transition-colors duration-300 ' +
            (segment <= score ? filledClass : 'bg-[rgba(232, 234, 237,0.06)]')
          }
        />
      ))}
    </div>
  )
}

function colorForScore(score: PasswordStrength): string {
  if (score <= 1) return 'bg-[var(--cv-primary)]'
  if (score === 2) return 'bg-[#FFB84F]'
  return 'bg-[#10B981]'
}
