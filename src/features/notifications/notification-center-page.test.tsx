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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// Grant flows are exercised by their own suites — here we only need the barrel
// to resolve so the page renders and wires action buttons.
vi.mock('../grants', () => ({
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
  GrantAgainDialog: () => null,
  RevokeGrantDialog: () => null,
  useApproveGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useDenyGrant: () => ({ mutate: denyMutate, isPending: false }),
  useRegrant: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeOrgGrant: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('../agents', () => ({
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
    type: 'grant_revoked',
    category: 'actionRequired',
    titleKey: 'notifications.grantRevoked.title',
    metadata: {
      grantId: 'g2',
      vaultId: 'v1',
      entryId: 'e2',
      agentId: 'a2',
      agentName: 'Old Bot',
      entryLabel: 'SSH Key',
      vaultName: 'Legacy',
    },
    occurredAt: '2026-06-15T09:00:00Z',
    readAt: '2026-06-15T09:05:00Z',
    actionState: 'resolved',
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
  })

  it('splits action-required (pending) into Required actions and resolved into History', () => {
    renderPage()

    // pending grant request → To-do card: type title + agent in the subtitle
    // (subtitle interpolates the agent name, so match by substring) + entry row
    expect(screen.getByText(/Deploy Bot/)).toBeInTheDocument()
    expect(screen.getByText('GitHub Token')).toBeInTheDocument()

    // a resolved action-required item drops into History (revoked → grant again)
    expect(screen.getByText(/Old Bot/)).toBeInTheDocument()
  })

  it('renders the To-do approve/deny actions for a grant_pending card', () => {
    renderPage()

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
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
