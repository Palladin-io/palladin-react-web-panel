import {
  useInfiniteQuery,
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
import {
  authenticatedQueryKeyForSession,
  useAuthenticatedMutation as useMutation,
  useAuthenticatedQueryKey,
} from '../auth'

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
 * Optimistically patch matching feed rows across ALL list caches and capture a
 * rollback snapshot. `patch` returns the new item (or the same reference to
 * leave it untouched). Returns the previous `[queryKey, data]` pairs so callers
 * can restore them on error.
 */
function patchFeedItems(
  queryClient: ReturnType<typeof useQueryClient>,
  session: Parameters<typeof authenticatedQueryKeyForSession>[0],
  patch: (item: NotificationItem) => NotificationItem,
): [readonly unknown[], NotificationsInfiniteData | undefined][] {
  const entries = queryClient.getQueriesData<NotificationsInfiniteData>({
    queryKey: authenticatedQueryKeyForSession(session, NOTIFICATIONS_LIST_PREFIX),
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
  const queryKey = useAuthenticatedQueryKey(notificationsListQueryKey(category))
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getNotifications({ cursor: pageParam, category }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
  })
}

/** Drives the nav badge (`unreadCount`) + the To-do header (`pendingActionCount`). */
export function useNotificationsSummary() {
  const queryKey = useAuthenticatedQueryKey(NOTIFICATIONS_SUMMARY_QUERY_KEY)
  return useQuery({
    queryKey,
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
    onMutate: async (id: string, context) => {
      const session = context.sessionSnapshot
      const listQueryKey = authenticatedQueryKeyForSession(
        session,
        NOTIFICATIONS_LIST_PREFIX,
      )
      const summaryQueryKey = authenticatedQueryKeyForSession(
        session,
        NOTIFICATIONS_SUMMARY_QUERY_KEY,
      )
      // Scope cancellation to the feed caches we actually patch — a broad
      // `['notifications']` prefix would also abort an in-flight preferences
      // fetch (`['notifications','preferences']`).
      await queryClient.cancelQueries({
        queryKey: listQueryKey,
      })
      context.assertSessionCurrent()
      const readAt = new Date().toISOString()
      const previousFeeds = patchFeedItems(queryClient, session, (item) =>
        item.id === id && !item.readAt ? { ...item, readAt } : item,
      )
      const previousSummary = queryClient.getQueryData<NotificationsSummary>(
        summaryQueryKey,
      )
      if (previousSummary) {
        queryClient.setQueryData<NotificationsSummary>(
          summaryQueryKey,
          {
            ...previousSummary,
            unreadCount: Math.max(0, previousSummary.unreadCount - 1),
          },
        )
      }
      return { previousFeeds, previousSummary, summaryQueryKey }
    },
    onError: (_err, _id, context) => {
      context?.previousFeeds?.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      )
      if (context?.previousSummary) {
        queryClient.setQueryData(
          context.summaryQueryKey,
          context.previousSummary,
        )
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
    onMutate: async (_variables, context) => {
      const session = context.sessionSnapshot
      const listQueryKey = authenticatedQueryKeyForSession(
        session,
        NOTIFICATIONS_LIST_PREFIX,
      )
      const summaryQueryKey = authenticatedQueryKeyForSession(
        session,
        NOTIFICATIONS_SUMMARY_QUERY_KEY,
      )
      // Same scoping rationale as useMarkNotificationRead — only the feed lists.
      await queryClient.cancelQueries({
        queryKey: listQueryKey,
      })
      context.assertSessionCurrent()
      const readAt = new Date().toISOString()
      const previousFeeds = patchFeedItems(queryClient, session, (item) =>
        item.readAt ? item : { ...item, readAt },
      )
      const previousSummary = queryClient.getQueryData<NotificationsSummary>(
        summaryQueryKey,
      )
      if (previousSummary) {
        queryClient.setQueryData<NotificationsSummary>(
          summaryQueryKey,
          { ...previousSummary, unreadCount: 0 },
        )
      }
      return { previousFeeds, previousSummary, summaryQueryKey }
    },
    onError: (_err, _vars, context) => {
      context?.previousFeeds?.forEach(([key, data]) =>
        queryClient.setQueryData(key, data),
      )
      if (context?.previousSummary) {
        queryClient.setQueryData(
          context.summaryQueryKey,
          context.previousSummary,
        )
      }
    },
  })
}

/** Per-type × per-channel preferences (LinkedIn-style matrix). */
export function useNotificationPreferences() {
  const queryKey = useAuthenticatedQueryKey(NOTIFICATIONS_PREFERENCES_QUERY_KEY)
  return useQuery({
    queryKey,
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
    onMutate: async (updates: PreferenceUpdate[], context) => {
      const preferencesQueryKey = authenticatedQueryKeyForSession(
        context.sessionSnapshot,
        NOTIFICATIONS_PREFERENCES_QUERY_KEY,
      )
      await queryClient.cancelQueries({ queryKey: preferencesQueryKey })
      context.assertSessionCurrent()
      const previous = queryClient.getQueryData<PreferenceItem[]>(
        preferencesQueryKey,
      )
      if (previous) {
        const byType = new Map(updates.map((u) => [u.type, u]))
        queryClient.setQueryData<PreferenceItem[]>(
          preferencesQueryKey,
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
      return { previous, preferencesQueryKey }
    },
    onError: (_err, _updates, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          context.preferencesQueryKey,
          context.previous,
        )
      }
    },
    onSuccess: (items: PreferenceItem[], _updates, context) => {
      if (!context) return
      // Server returns the EFFECTIVE state (mandatory locks applied).
      queryClient.setQueryData(
        context.preferencesQueryKey,
        items,
      )
    },
  })
}
