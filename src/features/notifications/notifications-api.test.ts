import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))
const putFn = vi.hoisted(() => vi.fn())

vi.mock('../../shared/api/client', () => ({
  api: {
    get: getFn,
    put: putFn,
  },
}))

import {
  getNotifications,
  getNotificationsSummary,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications-api'

const item = {
  id: 'n1',
  type: 'grant_pending',
  topic: 'access',
  title: 'Access request',
  body: 'Deploy Bot requests access',
  data: { grantId: 'g1' },
  isActionRequired: true,
  isSecurityCritical: false,
  isRead: false,
  isResolved: false,
  resolution: null,
  actionType: 'review_grant',
  actionTarget: '/inbox',
  occurredAt: '2026-06-15T10:00:00Z',
}

describe('notifications-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    getFn.mockClear()
    putFn.mockReset()
  })

  it('parses notifications and passes the cursor', async () => {
    getJson.mockResolvedValue({ items: [item], nextCursor: 'next' })

    const page = await getNotifications('cursor')

    expect(getFn).toHaveBeenCalledWith('api/notifications', {
      searchParams: { cursor: 'cursor' },
    })
    expect(page.items[0]).toEqual(item)
    expect(page.nextCursor).toBe('next')
  })

  it('parses the notification summary', async () => {
    getJson.mockResolvedValue({ unreadCount: 4, openActionRequiredCount: 2 })

    await expect(getNotificationsSummary()).resolves.toEqual({
      unreadCount: 4,
      openActionRequiredCount: 2,
    })
  })

  it('marks one or all notifications as read', async () => {
    await markNotificationRead('n1')
    await markAllNotificationsRead()

    expect(putFn).toHaveBeenNthCalledWith(1, 'api/notifications/n1/read')
    expect(putFn).toHaveBeenNthCalledWith(2, 'api/notifications/read-all')
  })
})
