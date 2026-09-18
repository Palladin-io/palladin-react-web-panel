import { HTTPError } from 'ky'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
  auth: { userId: 'privacy-user', accessToken: 'access', refreshToken: 'refresh' }, navigate: vi.fn(), generation: 0, pathname: '/privacy-choices',
}))
vi.mock('../auth', () => ({
  SecurityPage: () => <h2>Security background</h2>,
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
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({
    location: { pathname: mocks.pathname },
    matches: [{ routeId: mocks.pathname, staticData: { consentSession: true } }],
  }),
}))
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
    mocks.pathname = '/privacy-choices'
    state = { consents: [consent(), consent('email_marketing')], maxAgeSeconds: 60 }
    mocks.get.mockImplementation(async () => structuredClone(state))
    mocks.update.mockReset()
  })
  afterEach(async () => { cleanup(); client?.clear(); onlineManager.setOnline(true); await i18n.changeLanguage('en') })

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

  it('settings starts optional switches off; dismissing does not record consent', async () => {
    localStorage.setItem('palladin-landing-privacy', JSON.stringify({ allowed: true }))
    mount(undefined, true)
    for (const option of await screen.findAllByRole('switch')) expect(option).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Features needed to run Palladin remain active.')).toBeVisible()
    expect(screen.getAllByRole('switch')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Privacy' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })

  it('startup has no close action and ignores Escape/backdrop; saving both off completes it', async () => {
    autoSave()
    const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('dialog').querySelector('[aria-hidden="true"]')!)
    expect(next).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls.map(([, decision]) => decision.granted)).toEqual([false, false])
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })

  it.each(['en', 'pl'] as const)('expands server notices independently of draft choices and links to the localized policy (%s)', async locale => {
    await i18n.changeLanguage(locale)
    mount(vi.fn())
    await screen.findAllByRole('switch')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    const title = locale === 'pl' ? 'Analityka produktu' : 'Product analytics'
    const toggle = screen.getByRole('switch', { name: title })
    await userEvent.click(toggle)
    const disclosure = screen.getByRole('button', { name: title })
    await userEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Test notice: product_analytics')).toBeVisible()
    const link = screen.getByRole('link', { name: /Privacy Policy|Polityce prywatności/ })
    expect(link).toHaveAttribute('href', locale === 'pl'
      ? 'https://palladin.io/pl/polityka-prywatnosci#8-analityka-marketing-i-prawa'
      : 'https://palladin.io/privacy/#8-analytics-marketing-and-rights')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(disclosure)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['en', 'pl'] as const)('outlined Save is immediately enabled with both off and records explicit denials in startup and settings (%s)', async locale => {
    await i18n.changeLanguage(locale)
    for (const startup of [true, false]) {
      state = { consents: [consent(), consent('email_marketing')], maxAgeSeconds: 60 }
      mocks.update.mockClear(); autoSave()
      const next = vi.fn(); const view = mount(startup ? next : undefined, !startup)
      for (const option of await screen.findAllByRole('switch')) expect(option).toHaveAttribute('aria-checked', 'false')
      const title = locale === 'pl' ? 'Prywatność' : 'Privacy'
      expect(screen.getAllByRole('heading', { name: title })).toHaveLength(1)
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
      expect(screen.getByRole('switch', { name: locale === 'pl' ? 'Marketing e-mailowy' : 'Email marketing' })).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText(locale === 'pl' ? 'Nowości i oferty Palladin na Twój e-mail.' : 'Palladin news and offers delivered by email.')).toBeVisible()
      expect(screen.getByText(locale === 'pl' ? 'Dane o korzystaniu z funkcji aplikacji.' : 'Data about how you use app features.')).toBeVisible()
      for (const control of screen.getAllByRole('switch')) expect(control.closest('[role=dialog]')).not.toBeNull()
      const surface = screen.getByRole('heading', { name: title }).parentElement!.parentElement!
      expect(surface.style.maxWidth).toBe('calc(440px * var(--cv-density-scale))')
      expect(surface).toContainElement(screen.getByTestId('modal-footer'))
      const save = screen.getByRole('button', { name: locale === 'pl' ? 'Zapisz wybór' : 'Save choice' })
      const accept = screen.getByRole('button', { name: locale === 'pl' ? 'Akceptuj wszystkie' : 'Accept all' })
      expect(within(screen.getByTestId('modal-footer')).getAllByRole('button')).toHaveLength(2)
      expect(save).toBeEnabled(); expect(save).toHaveClass('bg-transparent', 'border-[var(--cv-btn-outline-border)]', 'flex-1', 'h-action')
      expect(accept).toBeEnabled(); expect(accept).toHaveClass('bg-[var(--cv-primary)]', 'flex-1', 'h-action')
      await userEvent.click(save)
      await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
      expect(mocks.update.mock.calls.map(([purpose, d]) => [purpose, d.granted])).toEqual([['product_analytics', false], ['email_marketing', false]])
      if (startup) await waitFor(() => expect(next).toHaveBeenCalledOnce())
      else {
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(screen.queryByRole('switch')).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Security background' })).toBeVisible()
        expect(mocks.navigate).toHaveBeenCalledWith({ to: '/settings/security', replace: true })
      }
      expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
      view.unmount(); client.clear()
    }
  })

  it.each([
    ['Save choice', 'Close'], ['Save choice', 'Escape'], ['Save choice', 'backdrop'],
    ['Accept all', 'Close'], ['Accept all', 'Escape'], ['Accept all', 'backdrop'],
  ])('offline paused-mutation conditions: %s fails immediately and allows %s without reconnect writes', async (action, dismiss) => {
    autoSave(); mount(undefined, true)
    await screen.findAllByRole('switch')
    act(() => onlineManager.setOnline(false))
    await userEvent.click(screen.getByRole('button', { name: action }))
    expect(await screen.findByRole('button', { name: 'Retry saving' })).toBeEnabled()
    expect(client.getMutationCache().getAll().every(m => m.state.status === 'error' && !m.state.isPaused)).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    if (dismiss === 'Close') await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    else if (dismiss === 'Escape') await userEvent.keyboard('{Escape}')
    else await userEvent.click(screen.getByRole('dialog').parentElement!.querySelector('[aria-hidden="true"]')!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations() })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })

  it.each(['Save choice', 'Accept all'])('offline %s retries only explicitly with the original decisions after reconnect', async action => {
    autoSave(); const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    act(() => onlineManager.setOnline(false))
    await userEvent.click(screen.getByRole('button', { name: action }))
    await screen.findByRole('button', { name: 'Retry saving' })
    const original = client.getMutationCache().getAll()[0].state.variables
    await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations() })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(client.getMutationCache().getAll()[1].state.variables).toEqual(original)
    expect(mocks.update.mock.calls.map(([, decision]) => decision.granted)).toEqual([action === 'Accept all', action === 'Accept all'])
  })

  it('startup keeps Continue in its pinned footer after failure without granting or queuing consent', async () => {
    autoSave()
    const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    act(() => onlineManager.setOnline(false))
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await screen.findByRole('button', { name: 'Retry saving' })
    await userEvent.click(within(screen.getByTestId('modal-footer')).getByRole('button', { name: 'Continue' }))
    expect(next).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    await act(async () => { onlineManager.setOnline(true); await client.resumePausedMutations() })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
  })

  it('a direct privacy link shows Security behind the dialog and closes there without a second startup prompt', async () => {
    mocks.pathname = '/settings/privacy'
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(<QueryClientProvider client={client}><PrivacyPrompt fallback={<span>Benefit dialog</span>} /><PrivacySettingsPage /></QueryClientProvider>)
    await screen.findAllByRole('switch')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Security background' })).toBeVisible()
    expect(screen.queryByText('Benefit dialog')).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/settings/security', replace: true })
    await act(async () => client.invalidateQueries())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    mocks.pathname = '/settings/security'
    view.rerender(<QueryClientProvider client={client}><PrivacyPrompt fallback={<span>Settings</span>} /></QueryClientProvider>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeVisible()
  })

  it('edits locally and saves both explicit decisions, activating only this installation after confirmation', async () => {
    autoSave(); const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) await userEvent.click(option)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls.map(([p, d]) => [p, d.granted])).toEqual([['email_marketing', true], ['product_analytics', true]])
    expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1 })
  })

  it.each(['en', 'pl'] as const)('Accept all confirms both purposes and activates this installation in both dialogs (%s)', async locale => {
    await i18n.changeLanguage(locale)
    for (const settings of [false, true]) {
      state = { consents: [consent(), consent('email_marketing')], maxAgeSeconds: 60 }
      mocks.update.mockClear(); autoSave()
      const next = vi.fn(); const view = mount(settings ? undefined : next, settings)
      for (const control of await screen.findAllByRole('switch')) expect(control).toHaveAttribute('aria-checked', 'false')
      await userEvent.click(screen.getByRole('button', { name: locale === 'pl' ? 'Akceptuj wszystkie' : 'Accept all' }))
      await waitFor(() => expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1 }))
      expect(mocks.update.mock.calls.map(([p, d]) => [p, d.granted])).toEqual([['email_marketing', true], ['product_analytics', true]])
      if (settings) await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      else expect(next).toHaveBeenCalledOnce()
      view.unmount(); client.clear(); localStorage.clear()
    }
  })

  it.each(['product_analytics', 'email_marketing'] as const)('Accept all cannot grant either purpose when %s notice is missing', async purpose => {
    state.consents = state.consents.map(c => c.purpose === purpose ? { ...c, currentNotice: null } : c)
    mount(); await screen.findAllByRole('switch')
    expect(screen.getByRole('button', { name: 'Accept all' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('Accept all partial failure remains open and retry activates only after confirmation, without replaying marketing', async () => {
    autoSave(); const update = mocks.update.getMockImplementation()!
    let fail = true
    mocks.update.mockImplementation((p, d) => p === 'product_analytics' && fail ? Promise.reject(new Error('offline')) : update(p, d))
    const next = vi.fn(); mount(next); await screen.findAllByRole('switch')
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(next).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    expect(screen.getByRole('dialog')).toBeVisible()
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls.map(([p]) => p)).toEqual(['email_marketing', 'product_analytics', 'product_analytics'])
    expect(mocks.update.mock.calls[2]).toEqual(mocks.update.mock.calls[1])
    expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1 })
  })

  it('Accept all explicitly activates this installation even with existing account grants', async () => {
    state.consents = state.consents.map(c => ({ ...c, status: 'granted', revision: 1, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }))
    autoSave(); mount(); await screen.findAllByRole('switch')
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(readLocalAnalyticsActivation('privacy-user')).not.toBeNull()
  })

  it('does not fabricate decisions when active notices are empty', async () => {
    state.consents = state.consents.map(c => ({ ...c, currentNotice: null }))
    const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) expect(option).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save choice' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Accept all' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(next).toHaveBeenCalledOnce(); expect(mocks.update).not.toHaveBeenCalled()
  })

  it('closes unchanged existing choices when notices are unavailable without writing consent', async () => {
    state.consents = state.consents.map(c => ({ ...c, status: 'granted', revision: 1,
      activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en', currentNotice: null }))
    const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    expect(next).toHaveBeenCalledOnce()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.authorize).not.toHaveBeenCalled()
  })

  it.each([0, 408, 429, 503])('withdrawal stops before Save and ambiguous/transient failure %s retries the identical request', async status => {
    state.consents[0] = { ...consent(), status: 'granted', revision: 2, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    setLocalAnalyticsActivation('privacy-user', { noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1 })
    mocks.update.mockRejectedValue(status ? new HTTPError(new Response(null, { status }), new Request('https://api.example.test/consents'), {}) : new Error('offline')); mount()
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
    await userEvent.click(screen.getByRole('switch', { name: 'Email marketing' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Enable on this device' }))
    await waitFor(() => expect(readLocalAnalyticsActivation('privacy-user')).not.toBeNull())
  })

  it.each([false, true])('device activation never saves an unknown marketing choice (draft selected: %s)', async selectMarketing => {
    state.consents[0] = { ...consent(), status: 'granted', revision: 1, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    autoSave(); mount()
    await screen.findByText('Off on this device')
    if (selectMarketing) await userEvent.click(screen.getByRole('switch', { name: 'Email marketing' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enable on this device' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('product_analytics', expect.objectContaining({ granted: true }))
    expect(state.consents[1].status).toBe('unknown')
    expect(readLocalAnalyticsActivation('privacy-user')).not.toBeNull()
  })

  it.each(['email_marketing', 'product_analytics'] as const)('ordinary Save stays off on %s failure and activates after the identical retry succeeds', async failingPurpose => {
    autoSave(); const save = mocks.update.getMockImplementation()!
    let fail = true
    mocks.update.mockImplementation((purpose, d) => purpose === failingPurpose && fail ? Promise.reject(new Error('offline')) : save(purpose, d))
    const next = vi.fn(); mount(next)
    for (const option of await screen.findAllByRole('switch')) await userEvent.click(option)
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(next).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
    expect(mocks.authorize).not.toHaveBeenCalled()
    const failedRequest = mocks.update.mock.calls.at(-1)
    const callsBeforeRetry = mocks.update.mock.calls.length
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls[callsBeforeRetry]).toEqual(failedRequest)
    expect(mocks.update.mock.calls.map(([purpose]) => purpose)).toEqual(failingPurpose === 'email_marketing'
      ? ['email_marketing', 'email_marketing', 'product_analytics'] : ['email_marketing', 'product_analytics', 'product_analytics'])
    expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1 })
    await waitFor(() => expect(mocks.authorize).toHaveBeenCalled())
  })

  it.each([{ version: 'test-v2', locale: 'en' }, { version: 'test-v1', locale: 'pl' }])('requires explicit reactivation after current notice changes to %j', async notice => {
    state.consents[0] = { ...consent(), status: 'granted', revision: 1, activationRevision: 1, noticeVersion: 'test-v1', noticeLocale: 'en' }
    state.consents[1] = { ...consent('email_marketing'), status: 'denied', revision: 1 }
    setLocalAnalyticsActivation('privacy-user', { noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1 })
    autoSave(); mount()
    expect(await screen.findByText('Enabled on this device')).toBeVisible()
    await waitFor(() => expect(mocks.authorize).toHaveBeenCalled())
    mocks.authorize.mockClear(); mocks.reset.mockClear()
    state.consents[0].currentNotice = { ...notice, text: 'Updated test notice' }
    await act(async () => client.invalidateQueries())
    expect(await screen.findByText('Off on this device')).toBeVisible()
    expect(mocks.reset).toHaveBeenCalled(); expect(mocks.authorize).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Enable on this device' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce())
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('product_analytics', expect.objectContaining({ noticeVersion: notice.version, locale: notice.locale, expectedRevision: 1, granted: true }))
    expect(await screen.findByText('Enabled on this device')).toBeVisible()
    expect(readLocalAnalyticsActivation('privacy-user')).toEqual({ noticeVersion: notice.version, noticeLocale: notice.locale, activationRevision: 1 })
    expect(mocks.authorize).toHaveBeenCalled()
  })

  it.each([false, true])('discards a 409 request and reconfirms on the authoritative revision (refresh fails: %s)', async refreshFails => {
    autoSave(); const save = mocks.update.getMockImplementation()!
    let completeRefresh!: (value: UserConsents) => void
    mocks.update.mockImplementationOnce(() => {
      state.consents[1] = { ...consent('email_marketing'), status: 'denied', revision: 7 }
      mocks.get.mockImplementation(() => refreshFails ? Promise.reject(new Error('offline')) : new Promise(resolve => { completeRefresh = resolve }))
      throw new HTTPError(new Response(null, { status: 409 }), new Request('https://api.example.test/consents'), {})
    }).mockImplementation(save)
    const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    const initialReads = mocks.get.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(mocks.get.mock.calls.length).toBeGreaterThan(initialReads))
    if (!refreshFails) {
      expect(screen.getByRole('button', { name: 'Save choice' })).toBeDisabled()
      await act(async () => completeRefresh(structuredClone(state)))
    }
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(screen.getByRole('alert')).toHaveTextContent('Privacy choices changed elsewhere')
    expect(screen.queryByRole('button', { name: 'Retry saving' })).not.toBeInTheDocument()
    expect(mocks.update).toHaveBeenCalledOnce(); expect(next).not.toHaveBeenCalled()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull(); expect(mocks.authorize).not.toHaveBeenCalled()
    mocks.get.mockImplementation(async () => structuredClone(state))
    if (refreshFails) {
      expect(screen.queryByRole('button', { name: 'Save choice' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
      await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
      await screen.findAllByRole('switch')
    }
    for (const option of screen.getAllByRole('switch')) expect(option).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(next).toHaveBeenCalledOnce())
    expect(mocks.update.mock.calls[1][1]).toMatchObject({ expectedRevision: 7, granted: true })
    expect(mocks.update.mock.calls[1][1].requestId).not.toBe(mocks.update.mock.calls[0][1].requestId)
    expect(readLocalAnalyticsActivation('privacy-user')).not.toBeNull()
  })

  it('preserves startup Continue after a rejected save refresh changes notice versions', async () => {
    mocks.update.mockImplementationOnce(() => {
      state.consents = state.consents.map(row => ({ ...row,
        currentNotice: { ...row.currentNotice!, version: 'test-v2' },
      }))
      throw new HTTPError(new Response(null, { status: 409 }), new Request('https://api.example.test/consents'), {})
    })
    const next = vi.fn(); mount(next)
    await screen.findAllByRole('switch')
    await userEvent.click(screen.getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    for (const option of screen.getAllByRole('switch')) expect(option).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByRole('button', { name: 'Retry saving' })).not.toBeInTheDocument()
    await userEvent.click(within(screen.getByTestId('modal-footer')).getByRole('button', { name: 'Continue' }))
    expect(next).toHaveBeenCalledOnce()
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(readLocalAnalyticsActivation('privacy-user')).toBeNull()
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
  it('waits for actionable notices before offering choices, without recording a dismissal', async () => {
    state.consents = state.consents.map(c => ({ ...c, currentNotice: null }))
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><PrivacyPrompt fallback={<span>Application</span>} /></QueryClientProvider>)
    await waitFor(() => expect(client.isFetching()).toBe(0))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Application')).toBeVisible()
    expect(dismissedPrivacyAccounts.has('privacy-user')).toBe(false)
    state.consents = [consent(), consent('email_marketing')]
    await act(async () => client.invalidateQueries())
    expect(await screen.findByRole('dialog', { name: 'Privacy' })).toBeVisible()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('offers first-entry choices and allows Continue after a failed refresh without recording consent', async () => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><PrivacyPrompt fallback={<span>Application</span>} /></QueryClientProvider>)
    await screen.findByRole('dialog', { name: 'Privacy' })
    await screen.findAllByRole('switch')
    mocks.get.mockRejectedValue(new Error('offline'))
    await act(async () => client.invalidateQueries())
    expect(screen.getByRole('dialog', { name: 'Privacy' })).toBeVisible()
    expect(await screen.findByText('Privacy choices could not be loaded. Analytics stays off.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Application')).toBeVisible()
    await act(async () => client.invalidateQueries())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('records the displayed new version when unchanged choices are explicitly saved', async () => {
    state.consents = state.consents.map(c => ({ ...c, status: 'granted', revision: 1,
      activationRevision: 1, noticeVersion: 'older-notice', noticeLocale: 'en' }))
    autoSave()
    mount()
    await screen.findAllByRole('switch')
    await userEvent.click(screen.getByRole('button', { name: 'Save choice' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2))
    expect(mocks.update.mock.calls.every(([, decision]) => decision.noticeVersion === 'test-v1')).toBe(true)
  })
})
