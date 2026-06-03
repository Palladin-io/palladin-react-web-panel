import { toast } from 'sonner'
import type { NotificationPayload } from './notification-types'

/**
 * Renders a notification as a Sonner toast. The Toaster itself is mounted once
 * in `Providers` (top-right) — this helper just picks the right variant based
 * on the notification type and forwards the server-supplied title/body.
 *
 * Title/body are localised server-side (the backend owns notification copy),
 * so we render them verbatim. Sonner escapes string content, so there is no
 * XSS surface here.
 */
export function showNotificationToast(payload: NotificationPayload) {
  const { type, title, body } = payload
  const options = { description: body }

  switch (type) {
    case 'grant_approved':
      toast.success(title, options)
      break
    case 'grant_denied':
    case 'grant_revoked':
      toast.error(title, options)
      break
    case 'grant_pending':
    case 'agent_pending':
    case 'credential_accessed':
    default:
      toast.info(title, options)
      break
  }
}
