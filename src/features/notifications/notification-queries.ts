import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import {
  getNotifications,
  getNotificationsSummary,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
  type NotificationItem,
  type NotificationsPage,
  type NotificationsSummary,
} from './notifications-api'
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type PreferenceItem,
  type PreferenceUpdate,
} from './preferences-api'

/** Root key — SignalR/FCM invalidate this prefix so every feed + the badge refresh live. */
export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const
export const NOTIFICATIONS_SUMMARY_QUERY_KEY = ['notifications', 'summary'] as const
export const NOTIFICATIONS_PREFERENCES_QUERY_KEY = [
  'notifications',
  'preferences',
] as const

/** Per-category feed key so To-do and History page independently. */
export function notificationsListQueryKey(category?: NotificationCategory) {
  return ['notifications', 'list', category ?? 'all'] as const
}

/** Prefix that matches EVERY per-category feed cache (`['notifications','list', …]`). */
const NOTIFICATIONS_LIST_PREFIX = ['notifications', 'list'] as const

type NotificationsInfiniteData = InfiniteData<NotificationsPage, string | undefined>

/**
 * Removes a successfully handled grant request from every cached Inbox feed.
 *
 * Grant approval/denial is committed by Vault before Notification's async
 * consumer collapses the immutable `grant_pending` row. Refetching immediately
 * can therefore race that projection and briefly restore already handled
 * actions. Patch the local projection after the authoritative mutation and let
 * the terminal notification/next refetch reconcile the feed.
 */
export function resolvePendingGrantNotification(
  queryClient: QueryClient,
  grantId: string,
): void {
  let removed = false
  const entries = queryClient.getQueriesData<NotificationsInfiniteData>({
    queryKey: NOTIFICATIONS_LIST_PREFIX,
  })
  for (const [key, data] of entries) {
    if (!data) continue
    const pages = data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => {
        const matches = item.type === 'grant_pending' && item.metadata?.grantId === grantId
        removed ||= matches
        return !matches
      }),
    }))
    queryClient.setQueryData<NotificationsInfiniteData>(key, { ...data, pages })
  }

  if (!removed) return
  const summary = queryClient.getQueryData<NotificationsSummary>(
    NOTIFICATIONS_SUMMARY_QUERY_KEY,
  )
  if (summary) {
    queryClient.setQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY, {
      ...summary,
      pendingActionCount: Math.max(0, summary.pendingActionCount - 1),
    })
  }
}

/**
 * Optimistically patch matching feed rows across ALL list caches and capture a
 * rollback snapshot. `patch` returns the new item (or the same reference to
 * leave it untouched). Returns the previous `[queryKey, data]` pairs so callers
 * can restore them on error.
 */
function patchFeedItems(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: (item: NotificationItem) => NotificationItem,
): [readonly unknown[], NotificationsInfiniteData | undefined][] {
  const entries = queryClient.getQueriesData<NotificationsInfiniteData>({
    queryKey: NOTIFICATIONS_LIST_PREFIX,
  })
  for (const [key, data] of entries) {
    if (!data) continue
    queryClient.setQueryData<NotificationsInfiniteData>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map(patch),
      })),
    })
  }
  return entries
}

/**
 * Infinite (cursor) feed, optionally scoped to a category. The server filters
 * by current vault access; we never re-filter for security on the client.
 */
export function useNotifications(category?: NotificationCategory) {
  return useInfiniteQuery({
    queryKey: notificationsListQueryKey(category),
    queryFn: ({ pageParam }) =>
      getNotifications({ cursor: pageParam, category }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
  })
}

/** Drives the nav badge (`unreadCount`) + the To-do header (`pendingActionCount`). */
export function useNotificationsSummary() {
  return useQuery({
    queryKey: NOTIFICATIONS_SUMMARY_QUERY_KEY,
    queryFn: getNotificationsSummary,
    staleTime: 15_000,
  })
}

/**
 * Mark a single notification read — PURELY optimistic, no refetch.
 *
 * Sets `readAt` on the matching row in every feed cache AND drops the summary
 * `unreadCount` by one. We deliberately do NOT invalidate the feed on settle:
 * a refetch would remount cards and re-trigger the mark-read-on-view observer
 * for rows whose `readAt` hadn't been patched locally — a request storm. The
 * PUT is idempotent and the optimistic feed patch is authoritative; we only
 * roll back on error.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (id: string) => {
      // Scope cancellation to the feed caches we actually patch — a broad
      // `['notifications']` prefix would also abort an in-flight preferences
      // fetch (`['notifications','preferences']`).
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_LIST_PREFIX })
      const readAt = new Date().toISOString()
      const previousFeeds = patchFeedItems(queryClient, (item) =>
        item.id === id && !item.readAt ? { ...item, readAt } : item,
      )
      const previousSummary = queryClient.getQueryData<NotificationsSummary>(
        NOTIFICATIONS_SUMMARY_QUERY_KEY,
      )
      if (previousSummary) {
        queryClient.setQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY, {
          ...previousSummary,
          unreadCount: Math.max(0, previousSummary.unreadCount - 1),
        })
      }
      return { previousFeeds, previousSummary }
    },
    onError: (_err, _id, context) => {
      context?.previousFeeds?.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      )
      if (context?.previousSummary) {
        queryClient.setQueryData(NOTIFICATIONS_SUMMARY_QUERY_KEY, context.previousSummary)
      }
    },
  })
}

/**
 * Mark everything read — PURELY optimistic, no refetch. Sets `readAt` on every
 * feed row + zeroes the summary `unreadCount`. Same no-invalidate rationale as
 * {@link useMarkNotificationRead}.
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      // Same scoping rationale as useMarkNotificationRead — only the feed lists.
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_LIST_PREFIX })
      const readAt = new Date().toISOString()
      const previousFeeds = patchFeedItems(queryClient, (item) =>
        item.readAt ? item : { ...item, readAt },
      )
      const previousSummary = queryClient.getQueryData<NotificationsSummary>(
        NOTIFICATIONS_SUMMARY_QUERY_KEY,
      )
      if (previousSummary) {
        queryClient.setQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY, {
          ...previousSummary,
          unreadCount: 0,
        })
      }
      return { previousFeeds, previousSummary }
    },
    onError: (_err, _vars, context) => {
      context?.previousFeeds?.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      )
      if (context?.previousSummary) {
        queryClient.setQueryData(NOTIFICATIONS_SUMMARY_QUERY_KEY, context.previousSummary)
      }
    },
  })
}

/** Per-type × per-channel preferences (LinkedIn-style matrix). */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATIONS_PREFERENCES_QUERY_KEY,
    queryFn: getNotificationPreferences,
    staleTime: 60_000,
  })
}

/**
 * Toggle a preference. Optimistically MERGES the changed channels into the
 * matching cached row (never replacing the whole row — so untouched channels
 * keep their value), then reconciles with the server's effective state on
 * success and rolls back on error.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (updates: PreferenceUpdate[]) =>
      updateNotificationPreferences(updates),
    onMutate: async (updates: PreferenceUpdate[]) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_PREFERENCES_QUERY_KEY })
      const previous = queryClient.getQueryData<PreferenceItem[]>(
        NOTIFICATIONS_PREFERENCES_QUERY_KEY,
      )
      if (previous) {
        const byType = new Map(updates.map((u) => [u.type, u]))
        queryClient.setQueryData<PreferenceItem[]>(
          NOTIFICATIONS_PREFERENCES_QUERY_KEY,
          previous.map((item) => {
            const update = byType.get(item.type)
            if (!update) return item
            // Merge ONLY the channels present in the update — leave the rest.
            return {
              ...item,
              ...(update.inboxEnabled !== undefined && { inboxEnabled: update.inboxEnabled }),
              ...(update.signalREnabled !== undefined && {
                signalREnabled: update.signalREnabled,
              }),
              ...(update.pushEnabled !== undefined && { pushEnabled: update.pushEnabled }),
            }
          }),
        )
      }
      return { previous }
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_PREFERENCES_QUERY_KEY, context.previous)
      }
    },
    onSuccess: (items: PreferenceItem[]) => {
      // Server returns the EFFECTIVE state (mandatory locks applied).
      queryClient.setQueryData(NOTIFICATIONS_PREFERENCES_QUERY_KEY, items)
    },
  })
}
