import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationItem } from './notifications-api'

const markRead = vi.hoisted(() => vi.fn())
const markAllRead = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

// Grant flows are exercised by their own suites — here we only need the barrel
// to resolve so the page renders and wires action buttons.
vi.mock('../grants', () => ({
  ApproveGrantDialog: () => null,
  DenyGrantDialog: () => null,
  GrantAgainDialog: () => null,
  RevokeGrantDialog: () => null,
  useApproveGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useDenyGrant: () => ({ mutate: vi.fn(), isPending: false }),
  useRegrant: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeOrgGrant: () => ({ mutate: vi.fn(), isPending: false }),
}))

const items: NotificationItem[] = [
  {
    id: 'n1',
    type: 'grant_pending',
    category: 'ActionRequired',
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
    category: 'ActionRequired',
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

vi.mock('./notification-queries', () => ({
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
}))

import { NotificationCenterPage } from './notification-center-page'

describe('NotificationCenterPage', () => {
  beforeEach(() => {
    markRead.mockReset()
    markAllRead.mockReset()
  })

  it('splits action-required (pending) into Required actions and resolved into History', () => {
    render(<NotificationCenterPage />)

    // pending grant request → To-do card with its agent + entry shown
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('GitHub Token')).toBeInTheDocument()

    // a resolved action-required item drops into History (revoked → grant again)
    expect(screen.getByText('Old Bot')).toBeInTheDocument()
  })

  it('renders the To-do approve/deny actions for a grant_pending card', () => {
    render(<NotificationCenterPage />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })

  it('marks everything read from the header', () => {
    render(<NotificationCenterPage />)

    fireEvent.click(screen.getByRole('button', { name: /mark all as read/i }))

    expect(markAllRead).toHaveBeenCalled()
  })
})
