import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationItem } from './notifications-api'

const markRead = vi.hoisted(() => vi.fn())
const markAllRead = vi.hoisted(() => vi.fn())
// Deny mutate that immediately resolves so we can assert the onSuccess effects
// (feed invalidation) the page wires up.
const denyMutate = vi.hoisted(() =>
  vi.fn(
    (
      _input: unknown,
      opts?: { onSuccess?: () => void },
    ) => opts?.onSuccess?.(),
  ),
)

const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigateMock,
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Grant flows are exercised by their own suites — here we only need the barrel
// to resolve so the page renders and wires action buttons.
vi.mock('../grants', async (importOriginal) => ({
  // Keep real formatters + constants (used by NotificationCard); stub only the
  // hooks and dialogs so grant flows are exercised by their own suites.
  ...(await importOriginal<typeof import('../grants')>()),
  // Live org-wide grants panel rendered only on the Grants tab — stubbed to a
  // marker so the tab-switch wiring can be asserted without its own deep mocks.
  OrgGrantsPanel: () => <div data-testid="org-grants-panel" />,
  ApproveGrantDialog: () => null,
  // Stub exposes a confirm button so the page's handleDeny → deny.mutate →
  // onSuccess wiring can be exercised end-to-end.
  DenyGrantDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean
    onConfirm: (reason: string) => void
  }) =>
    open ? (
      <button type="button" onClick={() => onConfirm('nope')}>
        confirm deny
      </button>
    ) : null,
  useApproveGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useDenyGrant: () => ({ mutate: denyMutate, isPending: false }),
}))

vi.mock('../agents', async (importOriginal) => ({
  // Keep real AgentAvatar (rendered by NotificationCard); stub the hooks/dialog.
  ...(await importOriginal<typeof import('../agents')>()),
  ApproveAgentDialog: () => null,
  useApproveAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}))

const items: NotificationItem[] = [
  {
    id: 'n1',
    type: 'grant_pending',
    category: 'actionRequired',
    titleKey: 'notifications.grantPending.title',
    metadata: {
      grantId: 'g1',
      vaultId: 'v1',
      entryId: 'e1',
      agentName: 'Deploy Bot',
      entryLabel: 'GitHub Token',
      vaultName: 'Production',
    },
    occurredAt: '2026-06-15T10:00:00Z',
    readAt: null,
    actionState: 'pending',
  },
  {
    id: 'n2',
    type: 'grant_approved',
    category: 'update',
    titleKey: 'notifications.grantApproved.title',
    metadata: {
      grantId: 'g2',
      vaultId: 'v1',
      entryId: 'e2',
      agentId: 'a2',
      agentName: 'Old Bot',
      entryLabel: 'SSH Key',
      vaultName: 'Legacy',
      actionDeepLink: '/vaults/v1/entries/e2',
    },
    occurredAt: '2026-06-15T09:00:00Z',
    readAt: '2026-06-15T09:05:00Z',
    actionState: null,
  },
  {
    id: 'n3',
    type: 'agent_approved',
    category: 'update',
    titleKey: 'notifications.agentApproved.title',
    metadata: {
      agentId: 'a3',
      agentName: 'CI Runner',
      actionDeepLink: '/agents/a3',
    },
    occurredAt: '2026-06-15T08:00:00Z',
    readAt: '2026-06-15T08:05:00Z',
    actionState: null,
  },
  {
    id: 'n4',
    type: 'agent_approved',
    category: 'update',
    titleKey: 'notifications.agentApproved.title',
    metadata: {
      agentId: 'a4',
      agentName: 'Rogue Bot',
      // Hostile backend value: not a known app route prefix.
      actionDeepLink: '/evil/phish',
    },
    occurredAt: '2026-06-15T07:00:00Z',
    readAt: '2026-06-15T07:05:00Z',
    actionState: null,
  },
]

vi.mock('./notification-queries', async () => {
  const actual =
    await vi.importActual<typeof import('./notification-queries')>('./notification-queries')
  return {
    ...actual,
    useNotifications: () => ({
      data: { pages: [{ items, nextCursor: null }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
      refetch: vi.fn(),
    }),
    useNotificationsSummary: () => ({
      data: { unreadCount: 1, pendingActionCount: 1 },
    }),
    useMarkNotificationRead: () => ({ mutate: markRead }),
    useMarkAllNotificationsRead: () => ({ mutate: markAllRead, isPending: false }),
  }
})

import { NotificationCenterPage } from './notification-center-page'

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <NotificationCenterPage />
    </QueryClientProvider>,
  )
  return { ...utils, invalidateSpy }
}

describe('NotificationCenterPage', () => {
  beforeEach(() => {
    markRead.mockReset()
    markAllRead.mockReset()
    denyMutate.mockClear()
    navigateMock.mockReset()
  })

  it('splits pending action-required into To-do and updates into History', () => {
    renderPage()

    // pending grant request → To-do card: type title + agent in the subtitle
    // (subtitle interpolates the agent name, so match by substring) + entry row
    expect(screen.getByText(/Deploy Bot/)).toBeInTheDocument()
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()

    // an update (grant_approved) drops into History as an immutable log
    expect(screen.getByText(/Old Bot/)).toBeInTheDocument()
  })

  it('renders the To-do approve/deny actions for a grant_pending card', () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })

  it('shows only a contextual non-mutating "View" link on History cards — no Revoke', () => {
    renderPage()

    // The immutable log card never offers a mutating action inline.
    expect(screen.queryByRole('button', { name: /revoke/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /grant again/i })).not.toBeInTheDocument()

    // Label names the deep-link target: grant_approved → access, agent_approved → agent.
    expect(screen.getByRole('button', { name: 'View Access' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'View Agent' }).length).toBeGreaterThan(0)
  })

  it('opens the vault on its Agents tab and marks read when "View Access" is clicked', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'View Access' }))

    expect(markRead).toHaveBeenCalledWith('n2')
    // Access cards route to the vault's Agents tab (live grant state lives there).
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/vaults/$vaultId',
      params: { vaultId: 'v1' },
      search: { tab: 'agents' },
    })
  })

  it('deep-links to the resource for a non-access "View" (agent)', () => {
    renderPage()

    // n3 (valid /agents/a3) is the first "View Agent" card.
    fireEvent.click(screen.getAllByRole('button', { name: 'View Agent' })[0])

    expect(markRead).toHaveBeenCalledWith('n3')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/agents/a3' })
  })

  it('ignores a deep-link that is not a known app route — no navigate, no mark-read', () => {
    renderPage()

    // n4 carries a hostile actionDeepLink ('/evil/phish'); it is the second
    // "View Agent" card. The guard must no-op rather than hand it to the router.
    fireEvent.click(screen.getAllByRole('button', { name: 'View Agent' })[1])

    expect(navigateMock).not.toHaveBeenCalled()
    expect(markRead).not.toHaveBeenCalledWith('n4')
  })

  it('renders the live OrgGrantsPanel on the Grants tab and hides the inbox search', () => {
    renderPage()

    // Inbox feed + its search are visible by default (All tab).
    expect(screen.getByPlaceholderText(/search by agent/i)).toBeInTheDocument()
    expect(screen.queryByTestId('org-grants-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /grants/i }))

    // Grants tab swaps in the live panel and drops the inbox search + log cards.
    expect(screen.getByTestId('org-grants-panel')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/search by agent/i)).not.toBeInTheDocument()
    expect(screen.queryByText('GitHub Token')).not.toBeInTheDocument()
  })

  it('marks everything read from the header', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /mark all as read/i }))

    expect(markAllRead).toHaveBeenCalled()
  })

  it('invalidates the notifications feed after a grant action resolves', () => {
    const { invalidateSpy } = renderPage()

    // Open the deny dialog from the pending card, then confirm. handleDeny calls
    // deny.mutate (stub resolves synchronously) → onSuccess → refreshFeed.
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    fireEvent.click(screen.getByRole('button', { name: 'confirm deny' }))

    expect(denyMutate).toHaveBeenCalled()
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })
})
