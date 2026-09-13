import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserConsent, UserConsents } from '../../shared/api/consents-api'
import { ConsentChoices } from './consent-choices'
import { PrivacySettingsPage } from './privacy-settings-page'
import i18n from '../../shared/lib/i18n'
import { PrivacyPrompt } from './privacy-prompt'
import { dismissedPrivacyAccounts } from './privacy-prompt-state'
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
function mount(onContinue?: () => void, settingsPage = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ConsentRuntime />{settingsPage ? <PrivacySettingsPage /> : <ConsentChoices source={onContinue ? 'web_onboarding' : 'web_settings'} onContinue={onContinue} />}</QueryClientProvider>)
}

describe('account privacy choices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    dismissedPrivacyAccounts.clear()
    mocks.auth.userId = 'privacy-user'
    mocks.generation = 0
    state = { consents: [consent(), consent('email_marketing')], maxAgeSeconds: 60 }
    mocks.get.mockImplementation(async () => structuredClone(state))
    mocks.update.mockReset()
  })
  afterEach(async () => { cleanup(); client?.clear(); await i18n.changeLanguage('en') })

  function autoSave() {
    mocks.update.mockImplementation(async (purpose, decision) => {
      const index = state.consents.findIndex(c => c.purpose === purpose)
      const old = state.consents[index]
      const updated = { ...old, status: decision.granted ? 'granted' : 'denied', revision: old.revision + 1,
        activationRevision: decision.granted ? old.activationRevision || old.revision + 1 : 0,
        noticeVersion: decision.noticeVersion, noticeLocale: decision.locale }
      state.consents[index] = updated
      return updated
    })
  }

  it('starts optional switches off, essential always active; dismissing does not record consent', async () => {
    localStorage.setItem('palladin-landing-privacy', JSON.stringify({ allowed: true }))
    const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) expect(option).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Always active')).toBeVisible()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Your privacy' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(next).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })

  it.each(['en', 'pl'] as const)('primary Save is immediately enabled with both off and records explicit denials in startup and settings (%s)', async locale => {
    await i18n.changeLanguage(locale)
    for (const startup of [true, false]) {
      state = { consents: [consent(), consent('email_marketing')], maxAgeSeconds: 60 }
      mocks.update.mockClear(); autoSave()
      const next = vi.fn(); const view = mount(startup ? next : undefined, !startup)
      for (const option of await screen.findAllByRole('switch')) expect(option).toHaveAttribute('aria-checked', 'false')
      const title = locale === 'pl' ? 'Twoja prywatność' : 'Your privacy'
      expect(screen.getAllByRole('heading', { name: title })).toHaveLength(1)
      expect(screen.queryByRole('dialog') !== null).toBe(startup)
      const surface = screen.getByRole('heading', { name: title }).parentElement!.parentElement!
      expect(surface.style.maxWidth).toBe('calc(480px * var(--cv-density-scale))')
      expect(surface).toContainElement(screen.getByTestId('modal-footer'))
      const save = screen.getByRole('button', { name: locale === 'pl' ? 'Zapisz wybór' : 'Save choice' })
      const essential = screen.getByRole('button', { name: locale === 'pl' ? 'Tylko niezbędne' : 'Essential only' })
      expect(save).toBeEnabled(); expect(save).toHaveClass('bg-[var(--cv-primary)]', 'flex-1', 'h-action')
      expect(essential).toBeEnabled(); expect(essential).toHaveClass('flex-1', 'h-action')
      await userEvent.click(save)
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
      expect(mocks.update.mock.calls.map(([purpose, d]) => [purpose, d.granted])).toEqual([['product_analytics', false], ['email_marketing', false]])
      if (startup) await waitFor(() => expect(next).toHaveBeenCalledOnce())
      else expect(next).not.toHaveBeenCalled()
      expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
      view.unmount(); client.clear()
    }
  })

  it('edits locally and saves both explicit decisions, activating only this installation after confirmation', async () => {
    autoSave(); const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) await userEvent.click(option)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls.map(([p, d]) => [p, d.granted])).toEqual([['product_analytics', true], ['email_marketing', true]])
    expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: 'test-v1', activationRevision: 1 })
  })

  it('essential-only records refusals for both available purposes', async () => {
    autoSave(); const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    await userEvent.click(screen.getByRole('button', { name: 'Essential only' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls.every(([, d]) => d.granted === false)).toBe(true)
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })

  it('does not fabricate decisions when active notices are empty', async () => {
    state.consents = state.consents.map(c => ({ ...c, currentNotice: null }))
    const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) expect(option).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save choice' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Essential only' }))
    expect(next).toHaveBeenCalledOnce(); expect(mocks.update).not.toHaveBeenCalled()
  })

  it('withdrawal stops transport before Save, error stays closed and retry keeps its request id', async () => {
    state.consents[0] = { ...consent(), status: 'granted', revision: 2, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    setLocalAnalyticsActivation('privacy-user', { noticeVersion: 'test-v1', activationRevision: 1 })
    mocks.update.mockRejectedValue(new Error('offline')); mount()
    await userEvent.click(await screen.findByRole('switch', { name: 'Product analytics' }))
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    expect(mocks.update).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    expect(mocks.update.mock.calls[1]).toEqual(mocks.update.mock.calls[0])
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('does not activate an existing account grant by saving unrelated marketing changes', async () => {
    state.consents[0] = { ...consent(), status: 'granted', revision: 1, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    autoSave(); mount()
    expect(await screen.findByText('Off on this device')).toBeVisible()
    await userEvent.click(screen.getByRole('switch', { name: 'Email news and offers' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Enable on this device' }))
    await waitFor(() => expect(readLocalAnalyticsActivation('privacy-user')).not.toBeNull())
  })

  it('partial failure reports no overall success and retries only the unconfirmed purpose', async () => {
    autoSave(); const save = mocks.update.getMockImplementation()!
    mocks.update.mockImplementation((purpose, d) => purpose === 'email_marketing' ? Promise.reject(new Error('offline')) : save(purpose, d))
    const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) await userEvent.click(option)
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(next).not.toHaveBeenCalled(); expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    expect(mocks.update.mock.calls.map(([purpose]) => purpose)).toEqual(['product_analytics', 'email_marketing', 'email_marketing'])
  })

  it('does not cache a late snapshot or activate after an account switch', async () => {
    let complete!: (value: UserConsents) => void
    mocks.get.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    mount(); await waitFor(() => expect(mocks.get).toHaveBeenCalledOnce())
    mocks.generation++; mocks.auth.userId = 'replacement-user'
    await act(async () => complete(state))
    await waitFor(() => expect(client.getQueryState(['account-consents', 'privacy-user', 'en'])?.status).toBe('error'))
    expect(client.getQueryData(['account-consents', 'privacy-user', 'en'])).toBeUndefined()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it('failed refresh after mutation does not activate or report success', async () => {
    autoSave(); mount()
    await userEvent.click(await screen.findByRole('switch', { name: 'Product analytics' }))
    mocks.get.mockRejectedValue(new Error('offline'))
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull(); expect(mocks.success).not.toHaveBeenCalled()
  })
  it('offers first-entry choices over the shell and remembers only session dismissal', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><PrivacyPrompt fallback={<span>Application</span>} /></QueryClientProvider>)
    await screen.findByRole('dialog', { name: 'Your privacy' })
    mocks.get.mockRejectedValue(new Error('offline'))
    await act(async () => client.invalidateQueries())
    expect(screen.getByRole('dialog', { name: 'Your privacy' })).toBeVisible()
    expect(screen.getByText('Privacy choices could not be loaded. Analytics stays off.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Application')).toBeVisible()
    await act(async () => client.invalidateQueries())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

})
