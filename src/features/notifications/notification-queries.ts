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

/** Mark a single notification read. Invalidates every feed + the badge. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })
}

/** Mark everything read. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
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
 * Toggle a preference. The server returns the EFFECTIVE state (mandatory locks
 * applied), which we write straight into the cache so a rejected change on a
 * locked row visibly snaps back without a refetch.
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (updates: PreferenceUpdate[]) =>
      updateNotificationPreferences(updates),
    onSuccess: (items: PreferenceItem[]) => {
      queryClient.setQueryData(NOTIFICATIONS_PREFERENCES_QUERY_KEY, items)
    },
  })
}
