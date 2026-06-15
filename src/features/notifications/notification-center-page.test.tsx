import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const markRead = vi.hoisted(() => vi.fn())
const markAllRead = vi.hoisted(() => vi.fn())

vi.mock('../auth', () => ({
  useAuthStore: vi.fn((selector: (state: { permissions: number }) => unknown) =>
    selector({ permissions: 0 }),
  ),
}))

vi.mock('../grants/components/pending-grants-panel', () => ({
  PendingGrantsPanel: () => <div>pending grants</div>,
}))

const items = [
  {
    id: 'n1',
    type: 'grant_pending',
    topic: 'access',
    title: 'Access request',
    body: 'Deploy Bot requests access',
    data: {},
    isActionRequired: true,
    isSecurityCritical: false,
    isRead: false,
    isResolved: false,
    resolution: null,
    actionType: 'review_grant',
    actionTarget: '/inbox',
    occurredAt: '2026-06-15T10:00:00Z',
  },
  {
    id: 'n2',
    type: 'security_alert',
    topic: 'security',
    title: 'New sign-in',
    body: 'A new browser signed in',
    data: {},
    isActionRequired: false,
    isSecurityCritical: true,
    isRead: true,
    isResolved: false,
    resolution: null,
    actionType: null,
    actionTarget: null,
    occurredAt: '2026-06-15T09:00:00Z',
  },
]

vi.mock('./notification-queries', () => ({
  useNotifications: () => ({
    data: { pages: [{ items, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  }),
  useNotificationsSummary: () => ({
    data: { unreadCount: 1, openActionRequiredCount: 1 },
  }),
  useMarkNotificationRead: () => ({ mutate: markRead }),
  useMarkAllNotificationsRead: () => ({ mutate: markAllRead, isPending: false }),
}))

import { NotificationCenterPage } from './notification-center-page'
import { safeInternalTarget } from './notification-target'

describe('NotificationCenterPage', () => {
  beforeEach(() => {
    markRead.mockReset()
    markAllRead.mockReset()
  })

  it('shows action-required items in To do and filters the inbox by topic', () => {
    render(<NotificationCenterPage />)

    expect(screen.getByText('To do')).toBeInTheDocument()
    expect(screen.getAllByText('Access request')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('Notification filters'))
    fireEvent.click(screen.getByRole('button', { name: 'security' }))

    expect(screen.getAllByText('New sign-in')).toHaveLength(1)
    expect(screen.getAllByText('Access request')).toHaveLength(1)
  })

  it('marks a notification as read from its card', () => {
    render(<NotificationCenterPage />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0])

    expect(markRead).toHaveBeenCalledWith('n1')
  })

  it('accepts only local action targets', () => {
    expect(safeInternalTarget('/agents/a1')).toBe('/agents/a1')
    expect(safeInternalTarget('//evil.example/path')).toBeNull()
    expect(safeInternalTarget('/\\evil.example')).toBeNull()
    expect(safeInternalTarget('https://evil.example')).toBeNull()
  })
})
