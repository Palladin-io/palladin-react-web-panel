import { z } from 'zod'
import { api } from '../../shared/api/client'

/**
 * Notification Center API client — matches the FROZEN contract in
 * `docs/obsidian/claw-vault/Product/Modules/Notification/Notification Center (CVT-162).md`.
 *
 * The feed is self-scoped (JWT) and already filtered by the caller's current
 * vault access. The server NEVER sends ready-made copy: it sends a `titleKey`
 * (i18n key) plus presentational `metadata` (names + ids, never secrets) and
 * the client localises in the user's language with bold names. Action state is
 * a live projection of the owning module's status — never a stored flag — so a
 * grant card resolves automatically once approved/denied/expired anywhere.
 */

/**
 * Notification category — drives the To-do vs History split. camelCase to match
 * the backend JSON serializer (camelCase enums); any other casing would make
 * `safeParse` reject every row and yield an empty feed.
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
 * `metadata` is intentionally loose: it carries display names + resource ids
 * the client reads opportunistically for localisation and deep-linking, and
 * its exact key set varies per `type`. All values are strings (or absent).
 * NEVER contains secrets/plaintext/keys (enforced server-side).
 */
const metadataSchema = z.record(z.string(), z.string())

const notificationItemSchema = z.object({
  id: z.string(),
  // `type` may be a type the client doesn't model yet — keep it a plain string
  // and narrow at use (forward-compatible with new backend types).
  type: z.string(),
  category: z.enum(NOTIFICATION_CATEGORY),
  // i18n KEY, not localised text — the client renders the copy.
  titleKey: z.string(),
  metadata: metadataSchema.nullable().optional().default({}),
  occurredAt: z.string(),
  // Absent/`null` when unread.
  readAt: z.string().nullable().optional(),
  // Live projection; absent/`null` for non-actionable items.
  actionState: z.enum(NOTIFICATION_ACTION_STATE).nullable().optional(),
})

export type NotificationItem = z.infer<typeof notificationItemSchema>

const notificationsPageSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional(),
})

export interface NotificationsPage {
  items: NotificationItem[]
  nextCursor: string | null
}

const notificationsSummarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  pendingActionCount: z.number().int().nonnegative(),
})

export type NotificationsSummary = z.infer<typeof notificationsSummarySchema>

export interface GetNotificationsParams {
  cursor?: string
  /** Server-side category filter (To-do vs History). */
  category?: NotificationCategory
  unreadOnly?: boolean
}

/**
 * Page of notifications, newest-first. Each item is parsed individually with
 * `safeParse` so one malformed row is skipped (and logged as a count) rather
 * than collapsing the whole feed.
 */
export async function getNotifications(
  params: GetNotificationsParams = {},
): Promise<NotificationsPage> {
  const searchParams = new URLSearchParams()
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.category) searchParams.set('category', params.category)
  if (params.unreadOnly) searchParams.set('unreadOnly', 'true')

  const raw = await api.get('api/notifications', { searchParams }).json()
  const page = notificationsPageSchema.parse(raw)

  const items: NotificationItem[] = []
  let skipped = 0
  for (const item of page.items) {
    const result = notificationItemSchema.safeParse(item)
    if (result.success) items.push(result.data)
    else skipped += 1
  }
  if (skipped > 0) {
    // No notification content is logged — only a count, to surface drift.
    console.warn(`[notifications] skipped ${skipped} malformed item(s)`)
  }
  return { items, nextCursor: page.nextCursor ?? null }
}

/** Badge (`unreadCount`) + To-do header counter (`pendingActionCount`). */
export async function getNotificationsSummary(): Promise<NotificationsSummary> {
  const response = await api.get('api/notifications/summary').json()
  return notificationsSummarySchema.parse(response)
}

/** Mark one notification read — idempotent (204). */
export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`api/notifications/${id}/read`)
}

/** Mark every notification read; returns how many rows changed. */
export async function markAllNotificationsRead(): Promise<{ markedCount: number }> {
  return api.put('api/notifications/read-all').json<{ markedCount: number }>()
}
