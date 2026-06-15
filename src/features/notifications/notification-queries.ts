import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getNotifications,
  getNotificationsSummary,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications-api'

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const
export const NOTIFICATIONS_LIST_QUERY_KEY = ['notifications', 'list'] as const
export const NOTIFICATIONS_SUMMARY_QUERY_KEY = ['notifications', 'summary'] as const

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: NOTIFICATIONS_LIST_QUERY_KEY,
    queryFn: ({ pageParam }) => getNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
  })
}

export function useNotificationsSummary() {
  return useQuery({
    queryKey: NOTIFICATIONS_SUMMARY_QUERY_KEY,
    queryFn: getNotificationsSummary,
    staleTime: 15_000,
  })
}

function useReadMutation(mutationFn: () => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY })
    },
  })
}

export function useMarkAllNotificationsRead() {
  return useReadMutation(markAllNotificationsRead)
}
