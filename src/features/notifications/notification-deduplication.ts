import type { NotificationPayload } from './notification-types'

const RETENTION_MS = 2 * 60_000
const MAX_RECENT = 256
const recent = new Map<string, number>()

function eventKey(payload: NotificationPayload): string {
  return `${payload.type}\u0000${payload.subjectId}\u0000${payload.occurredAt}`
}

/** Claim a logical event once across SignalR and foreground FCM delivery. */
export function claimNotificationEvent(payload: NotificationPayload, now = Date.now()): boolean {
  for (const [key, seenAt] of recent) {
    if (now - seenAt > RETENTION_MS) recent.delete(key)
  }
  const key = eventKey(payload)
  if (recent.has(key)) return false
  recent.set(key, now)
  while (recent.size > MAX_RECENT) recent.delete(recent.keys().next().value!)
  return true
}

export function resetNotificationDeduplicationForTests(): void {
  recent.clear()
}
