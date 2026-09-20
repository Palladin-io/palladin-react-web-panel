import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserHistory, createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { useAuthStore } from '../../auth'
import { captureEntryShareIngress, clearPendingEntryShare, readPendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { entryShareFragment } from '../../../shared/crypto/entry-share-link'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import { installEntryShareNavigation } from '../../../shared/lib/entry-share-navigation'

const api = vi.hoisted(() => ({ open: vi.fn(), receive: vi.fn(), confirm: vi.fn() }))
vi.mock('./recipient-api', () => ({ openRecipientSession: api.open, receiveEntryShare: api.receive,
  confirmRecipientDisplay: api.confirm, endRecipientShare: vi.fn(), requestRecipientOtp: vi.fn(),
  verifyRecipientOtp: vi.fn(), verifyRecipientSecret: vi.fn() }))
vi.mock('@react-oauth/google', () => ({ useGoogleLogin: () => vi.fn() }))
let client: QueryClient
const sharePath = `/share/${fixture.scope.shareId}`

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useAuthStore.getState().logout()
  const fragment = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(7) })
  window.history.replaceState(null, '', `${sharePath}${fragment}`)
  captureEntryShareIngress(window)
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  api.open.mockResolvedValue({ sessionId: '44442233-4455-4677-8899-aabbccddeeff', sessionToken: 's'.repeat(43),
    recipientMode: 'anyoneWithLink', protection: 'none', expiresAt: new Date(Date.now() + 900_000).toISOString() })
  api.receive.mockResolvedValue({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext })
})
afterEach(() => { cleanup(); client.clear(); clearPendingEntryShare(); vi.restoreAllMocks() })

describe('Sharing continuation in the actual application router', () => {
  it.each([fixture.scope.shareId, '99992233-4455-4677-8899-aabbccddeeff'])('handles an in-document replacement before router observers (%s)', async (nextId) => {
    const fragment = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(8) })
    const nativeReplace = window.history.replaceState.bind(window.history)
    nativeReplace(null, '', `${sharePath}${fragment}`)
    const failure = vi.fn()
    const stop = installEntryShareNavigation(window, failure)
    const history = createBrowserHistory()
    const router = createRouter({ routeTree, history })
    const observed: string[] = []
    const unsubscribe = router.subscribe('onBeforeNavigate', ({ toLocation }) => observed.push(toLocation.href))
    try {
      await router.load()
      render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
      await userEvent.click(await screen.findByRole('button', { name: 'Continue in browser' }))
      await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
      await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
      const previousSignal = api.open.mock.calls[0][2] as AbortSignal
      const nextPath = `/share/${nextId}`
      await act(async () => {
        nativeReplace(null, '', `${nextPath}${fragment}`)
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      expect(await screen.findByRole('button', { name: 'Continue in browser' })).toBeEnabled()
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
      expect(previousSignal.aborted).toBe(true)
      expect(api.receive).toHaveBeenCalledOnce()
      expect(api.confirm).toHaveBeenCalledOnce()
      expect(router.state.location.href).toBe(nextPath)
      expect(observed.every((href) => !href.includes('#') && !href.includes('key=') && !href.includes('access='))).toBe(true)
      expect(failure).not.toHaveBeenCalled()
    } finally { cleanup(); unsubscribe(); history.destroy(); stop() }
  })

  it.each(['return', 'register', 'abandon'] as const)('preserves only the explicit auth itinerary: %s', async (next) => {
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [sharePath] }) })
    await router.load()
    render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
    await userEvent.click(await screen.findByRole('button', { name: 'Continue in browser' }))
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toEqual({ redirect: sharePath })
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(readPendingEntryShare(fixture.scope.shareId)).not.toBeNull()
    if (next === 'register') {
      await userEvent.click(screen.getByRole('link', { name: /create.*account/i }))
      await waitFor(() => expect(router.state.location.pathname).toBe('/register'))
      expect(router.state.location.search).toEqual({ redirect: sharePath })
    }
    if (next === 'abandon') {
      await act(async () => { await router.navigate({ to: '/login', search: {} }) })
      expect(readPendingEntryShare(fixture.scope.shareId)).toBeNull()
    }
    await act(async () => { await router.navigate({ href: sharePath }) })
    if (next === 'abandon') expect(await screen.findByText(/Reopen the original full link/)).toBeInTheDocument()
    else expect(await screen.findByLabelText('Password')).toHaveValue('fixture-only')
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledOnce()
  })
})
