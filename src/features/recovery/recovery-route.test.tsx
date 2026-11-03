import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { useAuthStore } from '../auth'

vi.mock('@react-oauth/google', () => ({ useGoogleLogin: () => vi.fn() }))
vi.mock('../../shared/api/account-api', async (importActual) => ({
  ...(await importActual<typeof import('../../shared/api/account-api')>()),
  getAccount: () => Promise.resolve({
    userId: '00112233-4455-4677-8899-aabbccddeeff', email: 'own@example.test', displayName: 'Own',
    avatarUrl: null, isOnboarded: true, emailVerified: true, salt: 'c2FsdA', encryptedPrivateKey: 'a2V5',
  }),
}))

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  useAuthStore.setState({ userId: 'own-account', accessToken: 'own-access', sessionId: 'own-refresh', emailVerified: true })
  useAuthStore.getState().lockVault()
})
afterEach(() => { cleanup(); useAuthStore.getState().logout(); localStorage.clear(); vi.restoreAllMocks() })

it('opens recovery from the locked unlock screen without bouncing back to unlock', async () => {
  const user = userEvent.setup()
  const router = renderAt('/unlock')
  await user.click(await screen.findByRole('link', { name: /forgot password/i }))

  await waitFor(() => expect(router.state.status).toBe('idle'))
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(router.state.location.pathname).toBe('/recovery')
})

it('still sends other protected routes on a locked vault to unlock', async () => {
  const router = renderAt('/unlock')
  await screen.findByRole('link', { name: /forgot password/i })
  await router.navigate({ to: '/vaults' })

  await waitFor(() => expect(router.state.location.pathname).toBe('/unlock'))
})
