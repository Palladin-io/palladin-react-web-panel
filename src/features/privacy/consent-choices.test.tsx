import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserConsent, UserConsents } from '../../shared/api/consents-api'
import { ConsentChoices } from './consent-choices'
import { ConsentRuntime } from './consent-runtime'
import { readLocalAnalyticsActivation, setLocalAnalyticsActivation } from '../../shared/lib/local-analytics-consent'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn(), reset: vi.fn(), authorize: vi.fn(), pageview: vi.fn(),
  auth: { userId: 'privacy-user', accessToken: 'access', refreshToken: 'refresh' }, generation: 0,
}))
vi.mock('../auth', () => ({
  useAuthStore: Object.assign((select: (state: typeof mocks.auth) => unknown) => select(mocks.auth), { getState: () => mocks.auth }),
  captureClientSessionGeneration: () => mocks.generation,
  clientSessionGenerationMatches: (generation: number) => generation === mocks.generation,
}))
vi.mock('../../shared/api/consents-api', () => ({
  getConsents: (...args: unknown[]) => mocks.get(...args),
  updateConsent: (...args: unknown[]) => mocks.update(...args),
  consentQueryKey: (userId: string, locale: string) => ['account-consents', userId, locale],
}))
vi.mock('../../shared/lib/analytics', () => ({ analytics: { reset: mocks.reset, authorize: mocks.authorize, pageview: mocks.pageview } }))
vi.mock('@tanstack/react-router', () => ({ useRouterState: () => '/privacy-choices' }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))

function consent(purpose: UserConsent['purpose'] = 'product_analytics'): UserConsent {
  return { purpose, scope: purpose === 'product_analytics' ? 'palladin_web_mobile' : 'palladin_email_news_and_offers',
    status: 'unknown', revision: 0, activationRevision: 0, recordedAt: null, noticeVersion: null, noticeLocale: null,
    currentNotice: { version: 'test-v1', locale: 'en', text: `Test notice: ${purpose}` } }
}
let state: UserConsents
let client: QueryClient
function mount(onContinue?: () => void) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ConsentRuntime /><ConsentChoices source={onContinue ? 'web_onboarding' : 'web_settings'} onContinue={onContinue} /></QueryClientProvider>)
}

describe('account privacy choices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.auth.userId = 'privacy-user'
    mocks.generation = 0
    state = { consents: [consent(), consent('email_marketing')], maxAgeSeconds: 60 }
    mocks.get.mockImplementation(async () => structuredClone(state))
    mocks.update.mockReset()
  })
  afterEach(() => { cleanup(); client?.clear() })

  it('shows both options off and permits continuing without inheriting landing consent', async () => {
    localStorage.setItem('palladin-landing-privacy', JSON.stringify({ allowed: true }))
    const next = vi.fn()
    mount(next)
    const options = await screen.findAllByRole('switch')
    for (const option of options) expect(option).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(next).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })

  it('waits for the backend before confirming a grant and activating this installation', async () => {
    let complete!: (value: UserConsent) => void
    mocks.update.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    mount(vi.fn())
    await userEvent.click(await screen.findByRole('switch', { name: 'Product analytics' }))
    expect(mocks.update).toHaveBeenCalledWith('product_analytics', expect.objectContaining({
      granted: true, expectedRevision: 0, noticeVersion: 'test-v1', locale: 'en', source: 'web_onboarding', requestId: expect.any(String),
    }))
    expect(screen.getByRole('switch', { name: 'Product analytics' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    state.consents[0] = { ...state.consents[0], status: 'granted', revision: 1, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    await act(async () => complete(state.consents[0]))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: 'test-v1', activationRevision: 1 })
  })

  it('does not cache a late consent snapshot under the previous account session', async () => {
    let complete!: (value: UserConsents) => void
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    mount()
    await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce())
    mocks.generation++
    mocks.auth.userId = 'replacement-user'
    const oldResponse: UserConsents = { ...state, consents: [{ ...consent(), status: 'granted',
      revision: 1, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }] }
    await act(async () => complete(oldResponse))
    await waitFor(() => expect(client.getQueryState(['account-consents', 'privacy-user', 'en'])?.status).toBe('error'))
    expect(client.getQueryData(['account-consents', 'privacy-user', 'en'])).toBeUndefined()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('immediately stops local analytics after failed withdrawal and retries the identical decision', async () => {
    state.consents[0] = { ...state.consents[0], status: 'granted', revision: 2, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    setLocalAnalyticsActivation('privacy-user', { noticeVersion: 'test-v1', activationRevision: 1 })
    mocks.update.mockRejectedValue(new Error('offline'))
    mount(vi.fn())
    await userEvent.click(await screen.findByRole('switch', { name: 'Product analytics' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.success).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    expect(mocks.update.mock.calls[1]).toEqual(mocks.update.mock.calls[0])
  })

  it('requires explicit local activation of an account grant and can withdraw when the current clause is unavailable', async () => {
    state.consents[0] = { ...state.consents[0], status: 'granted', revision: 2, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en', currentNotice: null }
    mocks.update.mockRejectedValue(new Error('offline'))
    mount()
    expect(await screen.findByRole('switch', { name: 'Product analytics' })).toHaveAttribute('aria-checked', 'true')
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('switch', { name: 'Product analytics' }))
    expect(mocks.update).toHaveBeenCalledWith('product_analytics', expect.objectContaining({ granted: false, noticeVersion: 'test-v1', locale: 'en' }))
  })

  it('never activates a late grant response after logout or account replacement', async () => {
    let complete!: (value: UserConsent) => void
    mocks.update.mockImplementation(() => new Promise(resolve => { complete = resolve }))
    mount()
    await userEvent.click(await screen.findByRole('switch', { name: 'Product analytics' }))
    mocks.generation++
    mocks.auth.userId = 'other-user'
    await act(async () => complete({ ...state.consents[0], status: 'granted', revision: 1, activationRevision: 1, noticeVersion: 'test-v1' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(mocks.success).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    expect(readLocalAnalyticsActivation('other-user')).toBeNull()
  })

  it('does not activate an older retry that returns a later grant from another device', async () => {
    mocks.update.mockResolvedValue({ ...consent(), status: 'granted', revision: 3, activationRevision: 3, noticeVersion: 'test-v1' })
    mount()
    await userEvent.click(await screen.findByRole('switch', { name: 'Product analytics' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })
})
