import { describe, expect, it } from 'vitest'
import { isAnalyticsPaused, pauseAnalytics } from './analytics-pause'

describe('temporary analytics suspension', () => {
  it('keeps overlapping forms separate and releases idempotently', () => {
    const first = pauseAnalytics('one')
    const second = pauseAnalytics('one')
    expect(isAnalyticsPaused('one')).toBe(true)
    expect(isAnalyticsPaused('two')).toBe(false)
    first()
    expect(isAnalyticsPaused('one')).toBe(true)
    second()
    expect(isAnalyticsPaused('one')).toBe(false)
    const later = pauseAnalytics('one')
    first()
    expect(isAnalyticsPaused('one')).toBe(true)
    later()
    expect(isAnalyticsPaused('one')).toBe(false)
  })
})
