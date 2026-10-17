import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { useAuthStore } from '../auth'
import { analytics } from '../../shared/lib/analytics'

const originalLocation = window.location
let client: QueryClient | undefined

afterEach(() => {
  cleanup()
  client?.clear()
  useAuthStore.getState().logout()
  localStorage.clear()
  onlineManager.setOnline(true)
  focusManager.setFocused(undefined)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

describe('consent route boundary', () => {
  it.each([
    ['/login', false], ['/register', false], ['/verify-email', false],
    ['/verify-email?token=synthetic-verification-token', false], ['/dev-toasts', false],
    ['/not-a-route', false], ['/privacy-choices', false], ['/recovery', true],
    ['/unlock', true], ['/', true], ['/settings/privacy', true], ['/vaults/test-vault', true],
  ])('uses the actual router hierarchy for %s (consent session: %s)', (href, allowed) => {
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [href] }) })
    const matches = router.matchRoutes(new URL(href, 'http://localhost').pathname)
    expect(matches.some(match => match.staticData.consentSession === true)).toBe(allowed)
    for (const match of matches.filter(match => match.staticData.consentSession === true)) {
      expect(router.routesById[match.routeId].options.beforeLoad).toBeTypeOf('function')
    }
  })

  it.each(['expired', 'revoked'])('preserves a verify-email token flow with a %s persisted session without consent requests or redirects', async reason => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const href = 'http://localhost:5000/verify-email?token=synthetic-verification-token'
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href } })
    useAuthStore.getState().logout()
    localStorage.setItem('palladin-auth', JSON.stringify({ version: 0, state: {
      userId: 'stale-persisted-user', sessionId: `synthetic-${reason}-refresh`, isOnboarded: true, emailVerified: false,
    } }))
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().userId).toBe('stale-persisted-user')
    const authorize = vi.spyOn(analytics, 'authorize')
    const pageview = vi.spyOn(analytics, 'pageview')
    // Even a cached account grant cannot authorize on this route.
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(['account-consents', 'stale-persisted-user', 'en'], {
      observedAt: Date.now(), maxAgeSeconds: 60, consents: [{ purpose: 'product_analytics', status: 'granted',
        noticeVersion: 'test-v1', noticeLocale: 'en', activationRevision: 1,
        currentNotice: { version: 'test-v1', locale: 'en', text: 'Synthetic notice' } }],
    })
    let finishVerification!: (response: Response) => void
    const fetch = vi.fn((request: Request) => {
      if (new URL(request.url).pathname === '/api/auth/verify-email') {
        return new Promise<Response>(resolve => { finishVerification = resolve })
      }
      // The real shared API client would attempt refresh and hard-redirect on these responses.
      return Promise.resolve(new Response(JSON.stringify({ error: reason }), { status: 401 }))
    })
    vi.stubGlobal('fetch', fetch)
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [href.replace('http://localhost:5000', '')] }) })
    await router.load()
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
    expect(await screen.findByText(/verifying your email/i)).toBeVisible()
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
    await act(async () => {
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await client!.invalidateQueries({ queryKey: ['account-consents'] })
      await client!.resumePausedMutations()
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(new URL(fetch.mock.calls[0][0].url).pathname).toBe('/api/auth/verify-email')
    expect(await fetch.mock.calls[0][0].clone().json()).toEqual({ token: 'synthetic-verification-token' })
    expect(window.location.href).toBe(href)
    expect(router.state.location.href).toBe('/verify-email?token=synthetic-verification-token')
    expect(useAuthStore.getState().sessionId).toBeNull()
    expect(authorize).not.toHaveBeenCalled()
    expect(pageview).not.toHaveBeenCalled()
    await act(async () => finishVerification(new Response(JSON.stringify({ userId: 'verification-link-owner' }), { status: 200 })))
    expect(await screen.findByText(/email verified/i)).toBeVisible()
    expect(fetch).toHaveBeenCalledOnce()
    expect(window.location.href).toBe(href)
  })
})
