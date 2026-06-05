import { deletePushToken } from './push-api'

/**
 * In-memory registry for the current session's FCM push-token id.
 *
 * Lives at module scope (not in a component/hook) so that logout — which can be
 * triggered from several places (sidebar button, 401 interceptor) — can delete
 * the server-side token without needing the push hook to be mounted.
 *
 * Never persisted: a closed tab drops the id, matching the rest of the
 * in-memory-only session model.
 */
let currentTokenId: string | null = null

export function setPushTokenId(id: string | null): void {
  currentTokenId = id
}

export function getPushTokenId(): string | null {
  return currentTokenId
}

/**
 * Best-effort deletion of the registered push token. Call on logout.
 * Swallows errors — a failed cleanup must never block logout, and the token
 * will be reaped server-side once it goes stale.
 */
export async function clearPushTokenOnLogout(): Promise<void> {
  const id = currentTokenId
  currentTokenId = null
  if (!id) return
  try {
    await deletePushToken(id)
  } catch {
    // Ignore — logout proceeds regardless.
  }
}
