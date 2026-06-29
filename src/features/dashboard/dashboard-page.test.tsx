import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './dashboard-page'

// Mutable state shared with the hoisted module mocks below. Each test sets the
// pieces it cares about in `beforeEach`/its body before rendering.
const state = vi.hoisted(() => ({
  account: null as Record<string, unknown> | null,
  vaults: { data: undefined } as { data: unknown },
  apiKeys: { data: undefined } as { data: unknown },
  agents: { data: undefined } as { data: unknown },
  pendingGrants: { data: undefined } as { data: unknown },
  webPush: { status: 'default', requestPermissionAndRegister: vi.fn() } as {
    status: string
    requestPermissionAndRegister: () => void
  },
}))

vi.mock('../../shared/api/account-api', () => ({
  ACCOUNT_QUERY_KEY: ['account'],
  getAccount: () => Promise.resolve(state.account),
}))
vi.mock('../vaults', () => ({ useVaults: () => state.vaults }))
vi.mock('../api-keys', () => ({ useApiKeys: () => state.apiKeys }))
vi.mock('../agents', () => ({
  useAgents: () => state.agents,
  useDeactivateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../grants', () => ({
  usePendingGrants: () => state.pendingGrants,
  formatRelativeTime: () => '2m ago',
}))
vi.mock('../notifications', () => ({ useWebPush: () => state.webPush }))

vi.mock('../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigateMock,
    Link: ({ children }: { children: ReactNode }) => children,
  }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const pendingAgent = {
  agentId: 'agent-1',
  name: 'agent-unknown-7f3a',
  status: 'pending',
  publicKey: null,
  createdAt: '2026-06-29T10:00:00Z',
}

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.clear()
    state.account = { isOnboarded: false, displayName: 'Patryk' }
    state.vaults = { data: { vaults: [] } }
    state.apiKeys = { data: [] }
    state.agents = { data: [] }
    state.pendingGrants = { data: [] }
    state.webPush = { status: 'default', requestPermissionAndRegister: vi.fn() }
    navigateMock.mockReset()
  })

  it('renders the onboarding checklist when not onboarded and no skip flag', async () => {
    render(<DashboardPage />, { wrapper })
    expect(await screen.findByText('Account Setup')).toBeInTheDocument()
    expect(screen.getByText('Add your first vault')).toBeInTheDocument()
  })

  it('does not render the checklist when onboarding_skipped is set', async () => {
    localStorage.setItem('onboarding_skipped', 'true')
    render(<DashboardPage />, { wrapper })
    // Stats labels confirm the page rendered; the checklist header must be absent.
    expect(await screen.findByText('Pending Approvals')).toBeInTheDocument()
    expect(screen.queryByText('Account Setup')).not.toBeInTheDocument()
  })

  it('renders the unknown-agent card for a pending agent once onboarded', async () => {
    state.account = { isOnboarded: true, displayName: 'Patryk' }
    state.agents = { data: [pendingAgent] }
    render(<DashboardPage />, { wrapper })
    expect(
      await screen.findByText(/unregistered agent — identify before granting access/i),
    ).toBeInTheDocument()
    expect(screen.getByText('agent-unknown-7f3a')).toBeInTheDocument()
  })

  it('shows the four stat cards in the normal state', async () => {
    state.account = { isOnboarded: true, displayName: 'Patryk' }
    render(<DashboardPage />, { wrapper })
    await waitFor(() =>
      expect(screen.queryByText('Account Setup')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Vaults')).toBeInTheDocument()
    expect(screen.getByText('Entries')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
