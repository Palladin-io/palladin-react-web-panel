import { api } from '../../shared/api/client'
import { sanitizeNotificationMetadata } from './notification-types'

/**
 * Notification Center API client — matches the FROZEN contract in
 * Keep this boundary aligned with the backend notification contract.
 *
 * The feed is self-scoped (JWT) and already filtered by the caller's current
 * vault access. The server NEVER sends ready-made copy. Structural metadata is
 * sanitized at this boundary and presentation is resolved later from unlocked,
 * authorized client caches. Action state is
 * a live projection of the owning module's status — never a stored flag — so a
 * grant card resolves automatically once approved/denied/expired anywhere.
 */

/**
 * Notification category — drives the To-do vs History split. camelCase to match
 * the backend JSON serializer (camelCase enums); unknown categories remain visible in History.
 */
export const NOTIFICATION_CATEGORY = ['actionRequired', 'update'] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[number]

/**
 * Live action-state projection for action-required items:
 * - `pending`  → still needs the user (renders the action buttons)
 * - `resolved` → handled elsewhere (renders the terminal "active access" note)
 * - `null`     → not an actionable item
 */
export const NOTIFICATION_ACTION_STATE = ['pending', 'resolved'] as const
export type NotificationActionState = (typeof NOTIFICATION_ACTION_STATE)[number]

/**
 * `metadata` is intentionally loose because its structural opaque IDs/facts
 * vary per type. Presentation fields are omitted even if a stale
 * producer sends them. All values are strings (or absent).
 */

export interface NotificationItem {
  id: string
  type: string
  category: string
  titleKey: string
  metadata: Record<string, string> | null
  occurredAt: string
  readAt?: string | null
  actionState?: string | null
}

export interface NotificationsPage {
  items: NotificationItem[]
  nextCursor: string | null
}

export interface NotificationsSummary {
  unreadCount: number
  pendingActionCount: number
}

export interface GetNotificationsParams {
  cursor?: string
  /** Server-side category filter (To-do vs History). */
  category?: NotificationCategory
  unreadOnly?: boolean
}

/** Notifications as returned by the backend; metadata remains value-free. */
export async function getNotifications(
  params: GetNotificationsParams = {},
): Promise<NotificationsPage> {
  const searchParams = new URLSearchParams()
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.category) searchParams.set('category', params.category)
  if (params.unreadOnly) searchParams.set('unreadOnly', 'true')

  const page = await api.get('api/notifications', { searchParams }).json<NotificationsPage>()
  return {
    nextCursor: page.nextCursor ?? null,
    items: page.items.map((item) => ({
      ...item,
      metadata: sanitizeNotificationMetadata(item.metadata),
    })),
  }
}

/** Badge (`unreadCount`) + To-do header counter (`pendingActionCount`). */
export async function getNotificationsSummary(): Promise<NotificationsSummary> {
  return api.get('api/notifications/summary').json<NotificationsSummary>()
}

/** Mark one notification read — idempotent (204). */
export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`api/notifications/${id}/read`)
}

/** Mark every notification read; returns how many rows changed. */
export async function markAllNotificationsRead(): Promise<{ markedCount: number }> {
  return api.put('api/notifications/read-all').json<{ markedCount: number }>()
}
