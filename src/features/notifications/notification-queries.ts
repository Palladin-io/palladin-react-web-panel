import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getNotifications,
  getNotificationsSummary,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCategory,
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
 * Mark a single notification read. Optimistically drops the summary
 * `unreadCount` by one so the nav badge / counter updates the instant the user
 * acts (no wait for the refetch), then reconciles on settle.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_SUMMARY_QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationsSummary>(
        NOTIFICATIONS_SUMMARY_QUERY_KEY,
      )
      if (previous) {
        queryClient.setQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY, {
          ...previous,
          unreadCount: Math.max(0, previous.unreadCount - 1),
        })
      }
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_SUMMARY_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })
}

/** Mark everything read. Optimistically zeroes the unread badge. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_SUMMARY_QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationsSummary>(
        NOTIFICATIONS_SUMMARY_QUERY_KEY,
      )
      if (previous) {
        queryClient.setQueryData<NotificationsSummary>(NOTIFICATIONS_SUMMARY_QUERY_KEY, {
          ...previous,
          unreadCount: 0,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(NOTIFICATIONS_SUMMARY_QUERY_KEY, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
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
