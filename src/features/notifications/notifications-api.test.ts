import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const getFn = vi.hoisted(() => vi.fn(() => ({ json: getJson })))
const putJson = vi.hoisted(() => vi.fn())
const putFn = vi.hoisted(() => vi.fn(() => ({ json: putJson })))

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
  category: 'actionRequired',
  titleKey: 'notifications.grantPending.title',
  metadata: {
    grantId: '11112233-4455-4677-8899-aabbccddeeff',
    agentName: 'Deploy Bot',
    vaultId: '22222233-4455-4677-8899-aabbccddeeff',
  },
  occurredAt: '2026-06-15T10:00:00Z',
  readAt: null,
  actionState: 'pending',
}

describe('notifications-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    getFn.mockClear()
    putJson.mockReset()
    putFn.mockClear()
  })

  it('parses notifications and forwards cursor + category filters', async () => {
    getJson.mockResolvedValue({ items: [item], nextCursor: 'next' })

    const page = await getNotifications({ cursor: 'cur', category: 'actionRequired' })

    const [path, options] = getFn.mock.calls[0]
    expect(path).toBe('api/notifications')
    const params = options.searchParams as URLSearchParams
    expect(params.get('cursor')).toBe('cur')
    expect(params.get('category')).toBe('actionRequired')
    expect(page.items[0].id).toBe('n1')
    expect(page.items[0].actionState).toBe('pending')
    expect(page.items[0].metadata).toEqual({
      grantId: '11112233-4455-4677-8899-aabbccddeeff',
      vaultId: '22222233-4455-4677-8899-aabbccddeeff',
    })
    expect(page.nextCursor).toBe('next')
  })

  it('skips a malformed item rather than collapsing the page', async () => {
    getJson.mockResolvedValue({
      items: [item, { id: 'bad' /* missing required fields */ }],
      nextCursor: null,
    })

    const page = await getNotifications()

    expect(page.items).toHaveLength(1)
    expect(page.items[0].id).toBe('n1')
    expect(page.nextCursor).toBeNull()
  })

  it('parses the summary (unreadCount + pendingActionCount)', async () => {
    getJson.mockResolvedValue({ unreadCount: 4, pendingActionCount: 2 })

    await expect(getNotificationsSummary()).resolves.toEqual({
      unreadCount: 4,
      pendingActionCount: 2,
    })
  })

  it('marks one and all notifications as read', async () => {
    putJson.mockResolvedValue({ markedCount: 3 })

    await markNotificationRead('n1')
    const result = await markAllNotificationsRead()

    expect(putFn).toHaveBeenNthCalledWith(1, 'api/notifications/n1/read')
    expect(putFn).toHaveBeenNthCalledWith(2, 'api/notifications/read-all')
    expect(result.markedCount).toBe(3)
  })
})
