import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- mocks ---
const markNotificationRead = vi.hoisted(() => vi.fn())
const markAllNotificationsRead = vi.hoisted(() => vi.fn())
vi.mock('./notifications-api', async (orig) => {
  const actual = await orig<typeof import('./notifications-api')>()
  return { ...actual, markNotificationRead, markAllNotificationsRead }
})

import type { NotificationItem, NotificationsSummary } from './notifications-api'
import {
  NOTIFICATIONS_SUMMARY_QUERY_KEY,
  notificationsListQueryKey,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from './notification-queries'
import { authenticatedQueryKey } from '../auth'
import type { AuthResponse } from '../../shared/api/types'
import { useAuthStore } from '../auth/stores/auth-store'
import {
  captureAuthenticatedSession,
  replaceAuthenticatedSession,
} from '../auth/session/session-boundary'
import { authenticatedQueryKeyForSession } from '../auth/session/authenticated-query-key'

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({
    sub: userId,
    org_id: organizationId,
  })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: true,
  }
}

function makeItem(id: string, readAt: string | null): NotificationItem {
  return {
    id,
    type: 'grant_pending',
    category: 'actionRequired',
    titleKey: 'k',
    metadata: {},
    occurredAt: '2026-06-17T10:00:00Z',
    readAt,
    actionState: 'pending',
  }
}

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // Two unread + one already-read across the "all" feed cache (one page).
  client.setQueryData(authenticatedQueryKey(notificationsListQueryKey('all')), {
    pages: [
      {
        items: [makeItem('n1', null), makeItem('n2', null), makeItem('n3', '2026-06-17T09:00:00Z')],
        nextCursor: null,
      },
    ],
    pageParams: [undefined],
  })
  client.setQueryData<NotificationsSummary>(
    authenticatedQueryKey(NOTIFICATIONS_SUMMARY_QUERY_KEY),
    {
    unreadCount: 2,
    pendingActionCount: 2,
    },
  )
  return client
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function feedItems(client: QueryClient): NotificationItem[] {
  const data = client.getQueryData<{ pages: { items: NotificationItem[] }[] }>(
    authenticatedQueryKey(notificationsListQueryKey('all')),
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
      client.getQueryData<NotificationsSummary>(
        authenticatedQueryKey(NOTIFICATIONS_SUMMARY_QUERY_KEY),
      )?.unreadCount,
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
      client.getQueryData<NotificationsSummary>(
        authenticatedQueryKey(NOTIFICATIONS_SUMMARY_QUERY_KEY),
      )?.unreadCount,
    ).toBe(2)
  })

  it('never rolls an optimistic A mutation back into B after a session change', async () => {
    await replaceAuthenticatedSession(session('user-a', 'org-a'))
    let rejectA!: (reason: Error) => void
    markNotificationRead.mockReturnValueOnce(new Promise<void>((_resolve, reject) => {
      rejectA = reject
    }))
    const client = seededClient()
    const sessionA = captureAuthenticatedSession()
    const aListKey = authenticatedQueryKeyForSession(
      sessionA,
      notificationsListQueryKey('all'),
    )
    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: wrapper(client),
    })

    result.current.mutate('n1')
    await waitFor(() => {
      const items = client.getQueryData<{ pages: { items: NotificationItem[] }[] }>(aListKey)
      expect(items?.pages[0]?.items[0]?.readAt).toBeTruthy()
    })

    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    const sessionB = captureAuthenticatedSession()
    const bListKey = authenticatedQueryKeyForSession(
      sessionB,
      notificationsListQueryKey('all'),
    )
    const bSummaryKey = authenticatedQueryKeyForSession(
      sessionB,
      NOTIFICATIONS_SUMMARY_QUERY_KEY,
    )
    client.setQueryData(bListKey, {
      pages: [{ items: [makeItem('n1', null)], nextCursor: null }],
      pageParams: [undefined],
    })
    client.setQueryData<NotificationsSummary>(bSummaryKey, {
      unreadCount: 7,
      pendingActionCount: 3,
    })

    rejectA(new Error('late A failure'))
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(client.getQueryData<{ pages: { items: NotificationItem[] }[] }>(bListKey)
      ?.pages[0]?.items[0]?.readAt).toBeNull()
    expect(client.getQueryData<NotificationsSummary>(bSummaryKey)?.unreadCount)
      .toBe(7)
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
      client.getQueryData<NotificationsSummary>(
        authenticatedQueryKey(NOTIFICATIONS_SUMMARY_QUERY_KEY),
      )?.unreadCount,
    ).toBe(0)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
