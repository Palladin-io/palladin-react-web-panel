import { z } from 'zod'
import { api } from '../../shared/api/client'

const notificationItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  topic: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  isActionRequired: z.boolean(),
  isSecurityCritical: z.boolean(),
  isRead: z.boolean(),
  isResolved: z.boolean(),
  resolution: z.string().nullable().optional(),
  actionType: z.string().nullable().optional(),
  actionTarget: z.string().nullable().optional(),
  occurredAt: z.string(),
})

const notificationsPageSchema = z.object({
  items: z.array(notificationItemSchema),
  nextCursor: z.string().nullable().optional(),
})

const notificationsSummarySchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  openActionRequiredCount: z.number().int().nonnegative(),
})

export type NotificationItem = z.infer<typeof notificationItemSchema>
export type NotificationsPage = z.infer<typeof notificationsPageSchema>
export type NotificationsSummary = z.infer<typeof notificationsSummarySchema>

export async function getNotifications(cursor?: string): Promise<NotificationsPage> {
  const searchParams = cursor ? { cursor } : undefined
  const response = await api.get('api/notifications', { searchParams }).json()
  return notificationsPageSchema.parse(response)
}

export async function getNotificationsSummary(): Promise<NotificationsSummary> {
  const response = await api.get('api/notifications/summary').json()
  return notificationsSummarySchema.parse(response)
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.put(`api/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('api/notifications/read-all')
}
