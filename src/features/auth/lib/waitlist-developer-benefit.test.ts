import { describe, expect, it } from 'vitest'
import { isWaitlistDeveloperBenefitActive } from './waitlist-developer-benefit'

describe('isWaitlistDeveloperBenefitActive', () => {
  const now = Date.parse('2026-08-26T12:00:00Z')

  it('recognizes the active Developer benefit window', () => {
    expect(isWaitlistDeveloperBenefitActive(
      '2026-08-25T12:00:00Z',
      '2026-09-25T12:00:00Z',
      now,
    )).toBe(true)
  })

  it('rejects incomplete, future, and expired windows', () => {
    expect(isWaitlistDeveloperBenefitActive(null, null, now)).toBe(false)
    expect(isWaitlistDeveloperBenefitActive(
      '2026-08-27T12:00:00Z',
      '2026-09-27T12:00:00Z',
      now,
    )).toBe(false)
    expect(isWaitlistDeveloperBenefitActive(
      '2026-07-25T12:00:00Z',
      '2026-08-25T12:00:00Z',
      now,
    )).toBe(false)
  })
})
