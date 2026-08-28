import type { InfiniteData, QueryClient } from '@tanstack/react-query'

export const NOTIFICATIONS_CACHE_ROOT_KEY = ['notifications'] as const
export const NOTIFICATIONS_CACHE_SUMMARY_KEY = ['notifications', 'summary'] as const
const NOTIFICATIONS_CACHE_LIST_PREFIX = ['notifications', 'list'] as const

interface GrantNotificationItemLike {
  type: string
  metadata?: Record<string, string> | null
}

interface NotificationsPageLike<TItem extends GrantNotificationItemLike> {
  items: TItem[]
}

interface NotificationsSummaryLike {
  pendingActionCount: number
}

type NotificationsInfiniteData = InfiniteData<
  NotificationsPageLike<GrantNotificationItemLike>,
  string | undefined
>

const resolvedGrantTombstones = new WeakMap<QueryClient, Set<string>>()
const pendingSummaryAdjustments = new WeakMap<QueryClient, Set<string>>()

/**
 * Reconciles a successful Vault grant mutation with Notification's asynchronous
 * inbox projection. This shared cache contract avoids a grants ↔ notifications
 * feature dependency cycle.
 */
export function resolvePendingGrantNotification(
  queryClient: QueryClient,
  grantId: string,
): void {
  const tombstones = resolvedGrantTombstones.get(queryClient) ?? new Set<string>()
  const alreadyResolved = tombstones.has(grantId)
  tombstones.add(grantId)
  resolvedGrantTombstones.set(queryClient, tombstones)

  const entries = queryClient.getQueriesData<NotificationsInfiniteData>({
    queryKey: NOTIFICATIONS_CACHE_LIST_PREFIX,
  })
  for (const [key, data] of entries) {
    if (!data) continue
    queryClient.setQueryData<NotificationsInfiniteData>(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) =>
          item.type !== 'grant_pending' || item.metadata?.grantId !== grantId),
      })),
    })
  }

  if (alreadyResolved) return
  const adjustments = pendingSummaryAdjustments.get(queryClient) ?? new Set<string>()
  adjustments.add(grantId)
  pendingSummaryAdjustments.set(queryClient, adjustments)

  const summary = queryClient.getQueryData<NotificationsSummaryLike>(
    NOTIFICATIONS_CACHE_SUMMARY_KEY,
  )
  if (summary) {
    queryClient.setQueryData<NotificationsSummaryLike>(
      NOTIFICATIONS_CACHE_SUMMARY_KEY,
      {
        ...summary,
        pendingActionCount: Math.max(0, summary.pendingActionCount - 1),
      },
    )
  }
}

/**
 * A terminal notification is per-grant evidence that Notification committed
 * the pending-row collapse. Aggregate count changes are deliberately ignored:
 * they may belong to an unrelated pending Agent or grant.
 */
export function confirmPendingGrantNotificationProjection(
  queryClient: QueryClient,
  grantId: string,
): void {
  pendingSummaryAdjustments.get(queryClient)?.delete(grantId)
}

export function omitResolvedPendingGrantNotifications<
  TItem extends GrantNotificationItemLike,
  TPage extends NotificationsPageLike<TItem>,
>(queryClient: QueryClient, page: TPage): TPage {
  const tombstones = resolvedGrantTombstones.get(queryClient)
  if (!tombstones?.size) return page

  for (const item of page.items) {
    const grantId = item.metadata?.grantId
    if (grantId && item.type !== 'grant_pending' && tombstones.has(grantId)) {
      confirmPendingGrantNotificationProjection(queryClient, grantId)
    }
  }

  return {
    ...page,
    items: page.items.filter((item) =>
      item.type !== 'grant_pending'
      || !item.metadata?.grantId
      || !tombstones.has(item.metadata.grantId)),
  }
}

export function adjustPendingGrantNotificationSummary<T extends NotificationsSummaryLike>(
  queryClient: QueryClient,
  summary: T,
): T {
  const adjustmentCount = pendingSummaryAdjustments.get(queryClient)?.size ?? 0
  if (adjustmentCount === 0) return summary
  return {
    ...summary,
    pendingActionCount: Math.max(0, summary.pendingActionCount - adjustmentCount),
  }
}
