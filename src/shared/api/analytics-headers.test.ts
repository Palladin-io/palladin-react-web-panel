import { describe, expect, it } from 'vitest'
import { getAnalyticsHeaders } from './analytics-headers'

describe('API transport metadata', () => {
  it('does not enrich backend events with a client analytics session or device fingerprint', () => {
    expect(getAnalyticsHeaders()).toEqual({ 'x-platform': 'web' })
  })
})
