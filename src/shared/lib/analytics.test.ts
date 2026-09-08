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

  it('removes URL data from the final enriched payload for opaque auth and pairing handles', () => {
    analytics.init()

    expect(mockPosthog.init).toHaveBeenCalledWith(
      'phc_test_key',
      expect.objectContaining({
        capture_pageview: false,
        capture_pageleave: false,
        save_campaign_params: false,
        save_referrer: false,
        advanced_disable_feature_flags: true,
        advanced_disable_feature_flags_on_first_load: true,
      }),
    )
    const config = mockPosthog.init.mock.calls[0][1]
    const sanitized = config.before_send({
      uuid: 'event-id',
      event: 'fe:agents:browser-pairing-approval-submitted',
      properties: {
        '$current_url': 'http://127.0.0.1:5173/agent-pairing/opaque-handle',
        '$pathname': '/agent-pairing/opaque-handle',
        '$referrer': 'http://127.0.0.1:5173/login?redirect=opaque-handle',
        '$session_entry_url': 'http://127.0.0.1:5173/agent-pairing/opaque-handle',
        '$session_entry_pathname': '/agent-pairing/opaque-handle',
        '$set_once': {
          '$initial_current_url': 'http://127.0.0.1:5173/agent-pairing/opaque-handle',
          safeNested: 'value-free',
        },
        safe: 'value-free',
      },
      $set_once: {
        '$initial_pathname': '/agent-pairing/opaque-handle',
        safeTopLevel: 'value-free',
      },
    })
    expect(sanitized.properties).toEqual({
      '$set_once': { safeNested: 'value-free' },
      safe: 'value-free',
    })
    expect(sanitized.$set_once).toEqual({ safeTopLevel: 'value-free' })
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
