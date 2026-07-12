import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetSessionId = vi.fn()

vi.mock('../lib/analytics.ts', () => ({
  analytics: {
    getSessionId: mockGetSessionId,
  },
}))

const { getAnalyticsHeaders, parseUserAgent } = await import(
  './analytics-headers.ts'
)

describe('parseUserAgent', () => {
  it('detects Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Chrome 120.0.0.0')
    expect(result.os).toBe('macOS')
  })

  it('detects Firefox on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Firefox 121.0')
    expect(result.os).toBe('Windows')
  })

  it('detects Safari on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Safari 17.2')
    expect(result.os).toBe('macOS')
  })

  it('detects Edge on Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Edge 120.0.0.0')
    expect(result.os).toBe('Windows')
  })

  it('detects Chrome on Linux', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Chrome 120.0.0.0')
    expect(result.os).toBe('Linux')
  })

  it('detects Safari on iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Safari 17.2')
    expect(result.os).toBe('iOS')
  })

  it('detects Chrome on Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Chrome 120.0.0.0')
    expect(result.os).toBe('Android')
  })

  it('returns Unknown for unrecognized user agent', () => {
    const ua = 'SomeCrawler/1.0'

    const result = parseUserAgent(ua)

    expect(result.browser).toBe('Unknown')
    expect(result.os).toBe('Unknown')
  })
})

describe('getAnalyticsHeaders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('includes x-session-id when session exists', () => {
    mockGetSessionId.mockReturnValue('session-xyz')

    const headers = getAnalyticsHeaders()

    expect(headers['x-session-id']).toBe('session-xyz')
  })

  it('omits x-session-id when session is undefined', () => {
    mockGetSessionId.mockReturnValue(undefined)

    const headers = getAnalyticsHeaders()

    expect(headers).not.toHaveProperty('x-session-id')
  })

  it('always includes x-user-agent header', () => {
    mockGetSessionId.mockReturnValue(undefined)

    const headers = getAnalyticsHeaders()

    expect(headers['x-user-agent']).toMatch(/^Palladin\/web \(.+; .+\)$/)
  })

  it('always includes x-platform header set to web', () => {
    mockGetSessionId.mockReturnValue(undefined)

    const headers = getAnalyticsHeaders()

    expect(headers['x-platform']).toBe('web')
  })
})
