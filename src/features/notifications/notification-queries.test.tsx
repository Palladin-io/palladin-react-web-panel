import type { ReactNode } from 'react'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- mocks ---
const markNotificationRead = vi.hoisted(() => vi.fn())
const markAllNotificationsRead = vi.hoisted(() => vi.fn())
const getNotifications = vi.hoisted(() => vi.fn())
const getNotificationsSummary = vi.hoisted(() => vi.fn())
vi.mock('./notifications-api', async (orig) => {
  const actual = await orig<typeof import('./notifications-api')>()
  return {
    ...actual,
    getNotifications,
    getNotificationsSummary,
    markNotificationRead,
    markAllNotificationsRead,
  }
})

import type { NotificationItem, NotificationsSummary } from './notifications-api'
import { resolvePendingGrantNotification } from '../../shared/lib/pending-grant-notification-reconciliation'
import {
  NOTIFICATIONS_SUMMARY_QUERY_KEY,
  notificationsListQueryKey,
  useNotifications,
  useNotificationsSummary,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from './notification-queries'

describe('Inbox-only receipt refresh', () => {
  it('repairs feed and badge in the foreground without polling hidden or unmounted observers', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const receipt: NotificationItem = { id: 'share', type: 'entry_share_received', category: 'update',
      titleKey: 'ignored', metadata: {}, occurredAt: '2026-09-20T12:00:00Z' }
    getNotifications.mockReset().mockResolvedValue({ items: [], nextCursor: null })
    getNotificationsSummary.mockReset().mockResolvedValue({ unreadCount: 0, pendingActionCount: 0 })
    vi.useFakeTimers(); focusManager.setFocused(true)
    const hook = renderHook(() => ({ feed: useNotifications(), badge: useNotificationsSummary() }), { wrapper: wrapper(client) })
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(getNotifications).toHaveBeenCalledOnce()
      getNotifications.mockResolvedValue({ items: [receipt], nextCursor: null })
      getNotificationsSummary.mockResolvedValue({ unreadCount: 1, pendingActionCount: 0 })
      await act(async () => { await vi.advanceTimersByTimeAsync(30_010) })
      expect(hook.result.current.feed.data?.pages[0].items).toEqual([receipt])
      expect(hook.result.current.badge.data?.unreadCount).toBe(1)
      expect(hook.result.current.badge.data?.pendingActionCount).toBe(0)
      focusManager.setFocused(false)
      const calls = getNotifications.mock.calls.length
      const summaries = getNotificationsSummary.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(getNotifications).toHaveBeenCalledTimes(calls)
      expect(getNotificationsSummary).toHaveBeenCalledTimes(summaries)
      hook.unmount()
      focusManager.setFocused(true)
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
      expect(getNotifications).toHaveBeenCalledTimes(calls)
      expect(getNotificationsSummary).toHaveBeenCalledTimes(summaries)
    } finally { hook.unmount(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers() }
  })
})

function makeItem(id: string, readAt: string | null): NotificationItem {
  return {
    id,
    type: 'grant_pending',
    category: 'actionRequired',
    titleKey: 'k',
    metadata: { grantId: id === 'n1' ? 'grant-1' : `grant-${id}` },
    occurredAt: '2026-06-17T10:00:00Z',
    readAt,
    actionState: 'pending',
  }
}

describe('resolvePendingGrantNotification', () => {
  it('removes the handled action from every feed cache and decrements the pending count once', () => {
    const client = seededClient()
    client.setQueryData(notificationsListQueryKey('actionRequired'), {
      pages: [{ items: [makeItem('n1', null)], nextCursor: null }],
      pageParams: [undefined],
    })

    resolvePendingGrantNotification(client, 'grant-1')

    expect(feedItems(client).some((item) => item.id === 'n1')).toBe(false)
    const actionFeed = client.getQueryData<{ pages: { items: NotificationItem[] }[] }>(
      notificationsListQueryKey('actionRequired'),
    )
    expect(actionFeed?.pages.flatMap((page) => page.items)).toEqual([])
    expect(
      client.getQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY)?.pendingActionCount,
    ).toBe(1)
  })

  it('keeps a handled pending action hidden across an automatic refetch race', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    resolvePendingGrantNotification(client, 'grant-1')
    getNotifications.mockResolvedValue({
      items: [makeItem('n1', null), makeItem('n2', null)],
      nextCursor: null,
    })
    const { result } = renderHook(() => useNotifications(), { wrapper: wrapper(client) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages.flatMap((page) => page.items).map((item) => item.id))
      .toEqual(['n2'])
  })

  it('keeps the grant adjustment across an unrelated aggregate-count decrease', async () => {
    const client = seededClient()
    resolvePendingGrantNotification(client, 'grant-1')
    getNotificationsSummary.mockResolvedValueOnce({ unreadCount: 2, pendingActionCount: 2 })
    const { result } = renderHook(() => useNotificationsSummary(), { wrapper: wrapper(client) })

    await result.current.refetch()
    expect(result.current.data?.pendingActionCount).toBe(1)

    getNotificationsSummary.mockResolvedValueOnce({ unreadCount: 2, pendingActionCount: 1 })
    const afterUnrelatedDecrease = await result.current.refetch()
    expect(afterUnrelatedDecrease.data?.pendingActionCount).toBe(0)
  })

  it('applies the grant adjustment when the mutation ran before summary loaded', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    resolvePendingGrantNotification(client, 'grant-1')
    getNotificationsSummary.mockResolvedValueOnce({ unreadCount: 3, pendingActionCount: 3 })
    const { result } = renderHook(() => useNotificationsSummary(), { wrapper: wrapper(client) })

    await waitFor(() => expect(result.current.data?.pendingActionCount).toBe(2))

    getNotificationsSummary.mockResolvedValueOnce({ unreadCount: 2, pendingActionCount: 2 })
    const afterUnrelatedDecrease = await result.current.refetch()
    expect(afterUnrelatedDecrease.data?.pendingActionCount).toBe(1)
  })
})

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // Two unread + one already-read across the "all" feed cache (one page).
  client.setQueryData(notificationsListQueryKey('all'), {
    pages: [
      {
        items: [makeItem('n1', null), makeItem('n2', null), makeItem('n3', '2026-06-17T09:00:00Z')],
        nextCursor: null,
      },
    ],
    pageParams: [undefined],
  })
  client.setQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY, {
    unreadCount: 2,
    pendingActionCount: 2,
  })
  return client
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function feedItems(client: QueryClient): NotificationItem[] {
  const data = client.getQueryData<{ pages: { items: NotificationItem[] }[] }>(
    notificationsListQueryKey('all'),
  )
  return data?.pages.flatMap((p) => p.items) ?? []
}

describe('useMarkNotificationRead', () => {
  beforeEach(() => {
    markNotificationRead.mockReset().mockResolvedValue(undefined)
  })

  it('optimistically sets readAt on the matching feed row + drops unreadCount, no invalidate', async () => {
    const client = seededClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: wrapper(client),
    })

    result.current.mutate('n1')

    await waitFor(() => expect(markNotificationRead).toHaveBeenCalled())
    expect(markNotificationRead.mock.calls[0][0]).toBe('n1')

    const items = feedItems(client)
    expect(items.find((i) => i.id === 'n1')?.readAt).toBeTruthy()
    expect(items.find((i) => i.id === 'n2')?.readAt).toBeNull() // untouched
    expect(
      client.getQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY)?.unreadCount,
    ).toBe(1)
    // No feed refetch — the storm fix.
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('rolls back the feed + summary on error', async () => {
    markNotificationRead.mockRejectedValueOnce(new Error('boom'))
    const client = seededClient()
    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: wrapper(client),
    })

    result.current.mutate('n1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(feedItems(client).find((i) => i.id === 'n1')?.readAt).toBeNull()
    expect(
      client.getQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY)?.unreadCount,
    ).toBe(2)
  })
})

describe('useMarkAllNotificationsRead', () => {
  beforeEach(() => {
    markAllNotificationsRead.mockReset().mockResolvedValue({ markedCount: 2 })
  })

  it('optimistically sets readAt on all feed rows + zeroes unreadCount, no invalidate', async () => {
    const client = seededClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: wrapper(client),
    })

    result.current.mutate()

    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled())

    expect(feedItems(client).every((i) => Boolean(i.readAt))).toBe(true)
    expect(
      client.getQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY)?.unreadCount,
    ).toBe(0)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
