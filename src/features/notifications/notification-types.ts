import { z } from 'zod'

export const NOTIFICATION_TYPES = [
  'grant_pending',
  'grant_approved',
  'grant_denied',
  'grant_revoked',
  'credential_accessed',
  'credential_stale',
  'agent_pending',
  'agent_approved',
  'agent_deactivated',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

const notificationCategorySchema = z.enum(['actionRequired', 'update'])
const wireMetadataSchema = z.record(z.string(), z.string())

// Presentation is never trusted from realtime/push input. Canonical Vault
// notifications do not carry these fields; stripping them also fails safely
// against a stale or compromised producer during the cutover.
const FORBIDDEN_PRESENTATION_KEYS = new Set([
  'account', 'accountName', 'actionDeepLink', 'actorName', 'agentName',
  'domain', 'entryLabel', 'host', 'ip', 'note', 'reason', 'vaultName',
  'agentIconKey', 'agentPublicKey',
])
const OPAQUE_ID_KEYS = new Set([
  'agentId', 'entityId', 'entryId', 'grantId', 'requestId', 'vaultId',
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function sanitizeNotificationMetadata(
  metadata: Record<string, string> | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key, value]) =>
      !FORBIDDEN_PRESENTATION_KEYS.has(key)
      && (!OPAQUE_ID_KEYS.has(key) || UUID.test(value))),
  )
}

const notificationPayloadSchema = z.object({
  subjectId: z.string().uuid(),
  type: z.string().min(1),
  category: notificationCategorySchema,
  titleKey: z.string().optional(),
  metadata: wireMetadataSchema.optional(),
  occurredAt: z.string().datetime({ offset: true }),
}).passthrough().transform((payload) => ({
  subjectId: payload.subjectId,
  type: payload.type,
  category: payload.category,
  occurredAt: payload.occurredAt,
  data: sanitizeNotificationMetadata(payload.metadata),
}))

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>

export function isKnownNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
}

export function parseNotificationPayload(raw: unknown): NotificationPayload | null {
  const result = notificationPayloadSchema.safeParse(raw)
  return result.success ? result.data : null
}
