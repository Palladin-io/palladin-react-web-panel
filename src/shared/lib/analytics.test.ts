import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPosthog = {
  init: vi.fn(),
  capture: vi.fn(),
  get_session_id: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}

vi.mock('posthog-js', () => ({
  default: mockPosthog,
}))

vi.mock('./env.ts', () => ({
  env: {
    posthogKey: 'phc_test_key',
    posthogHost: 'https://app.posthog.com',
  },
}))

// Import after mocks are set up
const { analytics } = await import('./analytics.ts')

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('capture', () => {
    it('calls posthog.capture with fe: prefix', () => {
      analytics.capture('auth', 'login-page-viewed')

      expect(mockPosthog.capture).toHaveBeenCalledWith(
        'fe:auth:login-page-viewed',
        undefined,
      )
    })

    it('passes properties through to posthog.capture', () => {
      const properties = { source: 'header', variant: 'A' }
      analytics.capture('dashboard', 'viewed', properties)

      expect(mockPosthog.capture).toHaveBeenCalledWith(
        'fe:dashboard:viewed',
        properties,
      )
    })
  })

  describe('getSessionId', () => {
    it('returns the posthog session ID', () => {
      mockPosthog.get_session_id.mockReturnValue('session-abc-123')

      expect(analytics.getSessionId()).toBe('session-abc-123')
    })

    it('returns undefined when posthog has no session', () => {
      mockPosthog.get_session_id.mockReturnValue(undefined)

      expect(analytics.getSessionId()).toBeUndefined()
    })
  })

  describe('identify', () => {
    it('calls posthog.identify with user ID', () => {
      analytics.identify('user-42')

      expect(mockPosthog.identify).toHaveBeenCalledWith('user-42', undefined)
    })

    it('passes properties through to posthog.identify', () => {
      const properties = { email: 'test@example.com' }
      analytics.identify('user-42', properties)

      expect(mockPosthog.identify).toHaveBeenCalledWith('user-42', properties)
    })
  })

  describe('reset', () => {
    it('calls posthog.reset', () => {
      analytics.reset()

      expect(mockPosthog.reset).toHaveBeenCalled()
    })
  })
})
