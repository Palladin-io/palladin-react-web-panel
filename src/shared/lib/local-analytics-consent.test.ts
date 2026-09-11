import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readLocalAnalyticsActivation, setLocalAnalyticsActivation, subscribeLocalAnalyticsConsent } from './local-analytics-consent'
import { clearLegacyAnalytics } from './clear-legacy-analytics'

describe('local installation activation', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear() })
  it('does not inherit landing consent or another account activation', () => {
    localStorage.setItem('palladin-landing-privacy', JSON.stringify({ allowed: true }))
    setLocalAnalyticsActivation('other', { noticeVersion: 'v1', activationRevision: 2 })
    expect(readLocalAnalyticsActivation('own')).toBeNull()
    expect(readLocalAnalyticsActivation('other')).toEqual({ noticeVersion: 'v1', activationRevision: 2 })
  })
  it('fails closed for malformed storage and failed removal', () => {
    localStorage.setItem('palladin-client-analytics:broken', '{')
    expect(readLocalAnalyticsActivation('broken')).toBeNull()
    setLocalAnalyticsActivation('account', { noticeVersion: 'v1', activationRevision: 1 })
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('unavailable') })
    expect(setLocalAnalyticsActivation('account', null)).toBe(false)
    expect(readLocalAnalyticsActivation('account')).toBeNull()
  })
  it('notifies same-tab and cross-tab subscribers of a changed decision', () => {
    const changed = vi.fn()
    const unsubscribe = subscribeLocalAnalyticsConsent(changed)
    setLocalAnalyticsActivation('tab-account', { noticeVersion: 'v1', activationRevision: 1 })
    window.dispatchEvent(new StorageEvent('storage', { key: 'palladin-client-analytics:tab-account' }))
    expect(changed).toHaveBeenCalledTimes(2)
    unsubscribe()
  })
  it('cleans only legacy analytics storage and cookies without initializing the SDK', () => {
    localStorage.setItem('ph_test_posthog', 'old-id')
    sessionStorage.setItem('ph_test_posthog', 'old-session')
    localStorage.setItem('application-choice', 'keep')
    document.cookie = 'ph_test_posthog=old-cookie; Path=/'
    clearLegacyAnalytics()
    expect(localStorage.getItem('ph_test_posthog')).toBeNull()
    expect(sessionStorage.getItem('ph_test_posthog')).toBeNull()
    expect(document.cookie).not.toContain('ph_test_posthog')
    expect(localStorage.getItem('application-choice')).toBe('keep')
  })
})
