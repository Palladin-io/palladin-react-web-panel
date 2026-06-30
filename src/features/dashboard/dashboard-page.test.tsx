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
vi.mock('../vaults', () => ({
  useVaults: () => state.vaults,
  // The "Your vaults" rail reuses the canonical VaultCard; stub it here.
  VaultCard: ({ vault }: { vault: { name: string } }) => <div>{vault.name}</div>,
}))
vi.mock('../api-keys', () => ({ useApiKeys: () => state.apiKeys }))
vi.mock('../agents', () => ({
  useAgents: () => state.agents,
  useDeactivateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('../grants', () => ({
  usePendingGrants: () => state.pendingGrants,
  useGrantSummary: () => ({ data: undefined }),
  formatRelativeTime: () => '2m ago',
  // The dashboard reuses the canonical pending-approvals panel; it has its own
  // tests, so here it is a lightweight stub standing in for the section.
  PendingGrantsPanel: () => <div>Pending approvals</div>,
}))
vi.mock('../notifications', () => ({ useWebPush: () => state.webPush }))

// Recent activity is gated on AuditView (absent in these tests → the section
// renders nothing), but its hooks still run, so stub the audit module to keep
// the unit isolated from the real org-audit query.
vi.mock('../audit', () => ({
  useOrgAuditLogs: () => ({
    data: undefined,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
  useAuditAgentNames: () => ({
    agentNameById: {},
    resolveAgentName: (id: string) => id,
    agentOptions: [],
    userOptions: [],
  }),
  AuditLogList: () => null,
}))

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

const activeAgent = {
  agentId: 'agent-2',
  name: 'Prod Bot',
  status: 'active',
  publicKey: 'pk',
  createdAt: '2026-06-01T10:00:00Z',
}

// The checklist hides only once all three setup steps are done (vault + API key
// + active agent) — not on `isOnboarded`. Post-onboarding states seed that here.
function completeSetup() {
  state.vaults = { data: { vaults: [{ id: 'v1', name: 'Work', entryCount: 3 }] } }
  state.apiKeys = { data: [{ id: 'k1' }] }
  state.agents = { data: [activeAgent] }
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
    expect(await screen.findByText('Account setup')).toBeInTheDocument()
    expect(screen.getByText('Add your first vault')).toBeInTheDocument()
  })

  it('does not render the checklist when onboarding_skipped is set', async () => {
    localStorage.setItem('onboarding_skipped', 'true')
    render(<DashboardPage />, { wrapper })
    // The pending-approvals panel confirms the normal state rendered; the
    // checklist header must be absent.
    expect(await screen.findByText('Pending approvals')).toBeInTheDocument()
    expect(screen.queryByText('Account setup')).not.toBeInTheDocument()
  })

  it('renders the unknown-agent card for a pending agent once onboarded', async () => {
    state.account = { isOnboarded: true, displayName: 'Patryk' }
    completeSetup()
    state.agents = { data: [activeAgent, pendingAgent] }
    render(<DashboardPage />, { wrapper })
    expect(
      await screen.findByText(/unregistered agent — identify before granting access/i),
    ).toBeInTheDocument()
    expect(screen.getByText('agent-unknown-7f3a')).toBeInTheDocument()
  })

  it('shows the four stat cards in the normal state', async () => {
    state.account = { isOnboarded: true, displayName: 'Patryk' }
    completeSetup()
    render(<DashboardPage />, { wrapper })
    await waitFor(() =>
      expect(screen.queryByText('Account setup')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Vaults')).toBeInTheDocument()
    expect(screen.getByText('Entries')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
