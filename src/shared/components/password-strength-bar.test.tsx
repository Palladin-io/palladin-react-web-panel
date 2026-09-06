import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PasswordStrengthBar } from './password-strength-bar'

describe('PasswordStrengthBar', () => {
  it('uses the theme-aware track token for unfilled segments', () => {
    const { container } = render(<PasswordStrengthBar score={0} />)

    const segments = container.querySelectorAll('.h-1')
    expect(segments).toHaveLength(4)
    for (const segment of segments) {
      expect(segment).toHaveClass('bg-[var(--cv-password-strength-track)]')
    }
  })

  it('uses semantic tokens for filled segments', () => {
    const { container, rerender } = render(<PasswordStrengthBar score={2} />)

    let segments = container.querySelectorAll('.h-1')
    expect(segments[0]).toHaveClass('bg-[var(--cv-password-strength-medium)]')
    expect(segments[1]).toHaveClass('bg-[var(--cv-password-strength-medium)]')
    expect(segments[2]).toHaveClass('bg-[var(--cv-password-strength-track)]')

    rerender(<PasswordStrengthBar score={4} />)
    segments = container.querySelectorAll('.h-1')
    for (const segment of segments) {
      expect(segment).toHaveClass('bg-[var(--cv-success)]')
    }
  })
})
