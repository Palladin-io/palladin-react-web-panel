import { describe, expect, it } from 'vitest'
import { shareExpiryLabel } from './share-expiry-label'

describe('Share expiry presentation', () => {
  const now = Date.parse('2026-09-26T10:00:00Z')
  it.each([
    ['2026-09-27T10:00:00Z', 'pl', 'za 1 dzień'],
    ['2026-09-29T10:00:00Z', 'pl', 'za 3 dni'],
    ['2026-09-26T13:00:00Z', 'pl', 'za 3 godziny'],
    ['2026-09-26T10:15:00Z', 'en', 'in 15 minutes'],
  ])('formats %s in %s', (expiry, language, expected) => {
    expect(shareExpiryLabel(expiry, language, now)).toBe(expected)
  })
  it('does not treat elapsed or missing dates as future validity', () => {
    expect(shareExpiryLabel('2026-09-26T10:00:00Z', 'pl', now)).toBeNull()
    expect(shareExpiryLabel('unavailable', 'pl', now)).toBeNull()
  })
})
