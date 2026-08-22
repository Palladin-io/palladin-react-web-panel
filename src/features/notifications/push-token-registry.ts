import { deletePushToken } from './push-api'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  type AuthenticatedSessionSnapshot,
} from '../auth/session/session-boundary'
import { registerAuthenticatedPrincipalReset } from '../../shared/lib/authenticated-principal-reset'

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
interface RegisteredPushToken {
  id: string
  session: AuthenticatedSessionSnapshot
}

let currentToken: RegisteredPushToken | null = null

export function setPushTokenId(
  id: string | null,
  session: AuthenticatedSessionSnapshot = captureAuthenticatedSession(),
): boolean {
  if (!authenticatedSessionMatches(session)) return false
  if (id === null) {
    currentToken = null
    return true
  }
  currentToken = { id, session }
  return true
}

export function getPushTokenId(): string | null {
  return currentToken?.id ?? null
}

/**
 * Best-effort deletion of the registered push token. Call on logout.
 * Swallows errors — a failed cleanup must never block logout, and the token
 * will be reaped server-side once it goes stale.
 */
export async function clearPushTokenOnLogout(
  expected: AuthenticatedSessionSnapshot = captureAuthenticatedSession(),
): Promise<void> {
  const token = currentToken
  if (!token) return
  if (token.session.userId !== expected.userId
    || token.session.organizationId !== expected.organizationId
    || token.session.sessionGeneration !== expected.sessionGeneration) return
  // Local delivery is disabled synchronously for the expected principal only;
  // a stale cleanup must never clear a replacement session's registration.
  currentToken = null
  try {
    await deletePushToken(token.id, token.session)
  } catch {
    // Ignore — logout proceeds regardless.
  }
}

registerAuthenticatedPrincipalReset(() => {
  currentToken = null
})
