import { describe, expect, it } from 'vitest'
import {
  evaluatePasswordStrength,
  isPasswordAcceptable,
} from './password-strength'

describe('evaluatePasswordStrength', () => {
  it('returns 0 for passwords shorter than 8 characters', () => {
    expect(evaluatePasswordStrength('short').score).toBe(0)
    expect(evaluatePasswordStrength('').score).toBe(0)
  })

  it('returns 1 for short-but-simple passwords', () => {
    expect(evaluatePasswordStrength('abcdefgh').score).toBe(1)
  })

  it('scores longer mixed-class passwords higher', () => {
    expect(evaluatePasswordStrength('abcdefghijkl').score).toBeGreaterThanOrEqual(2)
    expect(evaluatePasswordStrength('Abcdefgh1!xyz').score).toBeGreaterThanOrEqual(3)
  })

  it('caps at 4 for very strong passwords', () => {
    expect(evaluatePasswordStrength('Abcdef1!ghijkl2@MN').score).toBe(4)
  })

  it('returns a human-readable label', () => {
    expect(evaluatePasswordStrength('').label).toMatch(/short/i)
    expect(evaluatePasswordStrength('Abcdef1!ghijkl2@MN').label).toMatch(/very/i)
  })
})

describe('isPasswordAcceptable', () => {
  it('rejects scores below the fair threshold', () => {
    expect(isPasswordAcceptable(0)).toBe(false)
    expect(isPasswordAcceptable(1)).toBe(false)
  })

  it('accepts fair and above', () => {
    expect(isPasswordAcceptable(2)).toBe(true)
    expect(isPasswordAcceptable(3)).toBe(true)
    expect(isPasswordAcceptable(4)).toBe(true)
  })
})
