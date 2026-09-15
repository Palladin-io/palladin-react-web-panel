import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../stores/auth-store'
import { sharedUnlockPreferenceGate } from '../../shared-unlock/preference-runtime'
import { SharedUnlockSection } from './shared-unlock-section'

vi.mock('../../../../shared/lib/env', () => ({ env: { apiUrl: 'https://api.test', sharedUnlockExtensionId: '' } }))
vi.mock('../../shared-unlock/manual-source', () => ({ getSharedUnlockSourceSnapshot: () => ({}), acceptSharedUnlockPreference: vi.fn() }))
let accountId: string
let preference = { sharedUnlockEnabled: true, revision: 1 }
let failSave = false
const fetcher = vi.fn<typeof fetch>()
let client: QueryClient
beforeEach(() => {
  localStorage.clear(); accountId = crypto.randomUUID(); preference = { sharedUnlockEnabled: true, revision: 1 }; failSave = false
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name: string, action: () => Promise<unknown>) => action() } })
  useAuthStore.setState({ userId: accountId, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', cryptoSessionGeneration: 7 })
  fetcher.mockReset().mockImplementation(async (_url, options) => {
    if (options?.method === 'PUT') {
      if (failSave) return new Response('{}', { status: 503 })
      const input = JSON.parse(String(options.body)) as { sharedUnlockEnabled: boolean; expectedRevision: number }
      if (input.expectedRevision !== preference.revision) return new Response('{}', { status: 409 })
      preference = { sharedUnlockEnabled: input.sharedUnlockEnabled, revision: preference.revision + 1 }
    }
    return new Response(JSON.stringify(preference))
  })
  vi.stubGlobal('fetch', fetcher)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } } })
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
function mount() { return render(<QueryClientProvider client={client}><SharedUnlockSection /></QueryClientProvider>) }
const scope = () => ({ accountId, apiUrl: 'https://api.test' })

it('uses keyboard controls and the account API without an installed extension', async () => {
  mount(); const user = userEvent.setup()
  const toggle = await screen.findByRole('switch', { name: 'Shared unlock' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  toggle.focus(); await user.keyboard(' ')
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  await waitFor(() => expect(toggle).toBeEnabled())
  await user.click(toggle)
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(2)
})
it('keeps a failed OFF locally paused, shows no success, and supports explicit retry', async () => {
  mount(); const user = userEvent.setup(), toggle = await screen.findByRole('switch')
  failSave = true; await user.click(toggle)
  expect(await screen.findByRole('alert')).toHaveTextContent('locally paused')
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(await sharedUnlockPreferenceGate.isAllowed(scope())).toBe(false)
  failSave = false; await user.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(await sharedUnlockPreferenceGate.isAllowed(scope())).toBe(true)
})
it('reports a CAS conflict, refreshes the account state and does not replay the write', async () => {
  mount(); const user = userEvent.setup(), toggle = await screen.findByRole('switch')
  preference = { sharedUnlockEnabled: false, revision: 2 }
  await user.click(toggle)
  expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere')
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1)
  expect(await sharedUnlockPreferenceGate.isAllowed(scope())).toBe(false)
})
it('refreshes an external account choice on its settings refresh', async () => {
  mount(); const toggle = await screen.findByRole('switch')
  preference = { sharedUnlockEnabled: false, revision: 2 }
  await act(async () => { await client.invalidateQueries({ queryKey: ['account', 'shared-unlock-preference'] }) })
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  expect(fetcher.mock.calls.every(([, options]) => options?.method !== 'PUT')).toBe(true)
})

it('pauses in the click handler before React Query schedules the save', async () => {
  mount(); const toggle = await screen.findByRole('switch')
  sharedUnlockPreferenceGate.assertAllowed(scope())
  fireEvent.click(toggle)
  expect(() => sharedUnlockPreferenceGate.assertAllowed(scope())).toThrow()
  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
})

it('rejects a late successful save after the own account session changes', async () => {
  mount(); const toggle = await screen.findByRole('switch')
  let finish!: () => void
  const previous = fetcher.getMockImplementation()!
  fetcher.mockImplementation((url, options) => options?.method === 'PUT'
    ? new Promise(resolve => { finish = () => resolve(new Response(JSON.stringify({ sharedUnlockEnabled: false, revision: 2 }))) })
    : previous(url, options))
  fireEvent.click(toggle)
  await waitFor(() => expect(finish).toBeDefined())
  await act(async () => { useAuthStore.setState({ userId: crypto.randomUUID(), cryptoSessionGeneration: 8 }); finish() })
  expect(await sharedUnlockPreferenceGate.isAllowed(scope())).toBe(false)
  await screen.findByRole('switch')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
