import { z } from 'zod'

/**
 * Notification types pushed by the backend over SignalR (`ReceiveNotification`)
 * and delivered as FCM data messages. Snake_case strings match the backend
 * `payload.type` contract exactly.
 */
export const NOTIFICATION_TYPES = [
  'grant_pending',
  'grant_approved',
  'grant_denied',
  'grant_revoked',
  'credential_accessed',
  'agent_pending',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * Shape of the `payload` object delivered with every notification.
 *
 * `data` carries resource identifiers (grantId / vaultId / agentId / entryId,
 * all strings). We intentionally keep it loose (`record of optional strings`)
 * because the exact id set varies per type and the UI only reads ids
 * opportunistically for query invalidation / deep-linking.
 */
export const notificationPayloadSchema = z.object({
  // `type` may arrive as an unknown string if the backend adds a new type the
  // client doesn't know yet — keep it as a plain string and narrow at use.
  type: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.string()).optional().default({}),
  timestamp: z.string().optional(),
})

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>

export function isKnownNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
}

/**
 * Parse a raw payload received from SignalR or FCM. Returns `null` on a
 * malformed payload rather than throwing — a single bad message must never
 * tear down the connection or the messaging handler.
 */
export function parseNotificationPayload(raw: unknown): NotificationPayload | null {
  const result = notificationPayloadSchema.safeParse(raw)
  return result.success ? result.data : null
}
