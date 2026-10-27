import i18n from 'i18next'
import { describe, expect, it, vi } from 'vitest'
import { formatRelativeTime } from './grant-format'

describe('relative grant creation dates', () => {
  it.each([
    [5, '5m ago'],
    [120, '2h ago'],
    [3 * 24 * 60, '3d ago'],
    [45 * 24 * 60, '45d ago'],
  ])('keeps a timestamp %i minutes old relative', (minutes, expected) => {
    const timestamp = Date.parse('2026-06-01T00:00:00Z')
    const now = vi.spyOn(Date, 'now').mockReturnValue(timestamp + minutes * 60_000)
    try {
      expect(formatRelativeTime(new Date(timestamp).toISOString(), i18n.t)).toBe(expected)
    } finally {
      now.mockRestore()
    }
  })
})
