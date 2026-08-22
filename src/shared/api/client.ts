import ky from 'ky'
import { env } from '../lib/env'
import { buildLoginRedirectHref } from '../lib/auth-redirect'
import {
  assertAuthenticatedPrincipal,
  useAuthStore,
} from '../../features/auth/stores/auth-store'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  StaleAuthenticatedSessionError,
  terminateAuthenticatedSession,
  type AuthenticatedSessionSnapshot,
} from '../../features/auth/session/session-boundary'
import { getAnalyticsHeaders } from './analytics-headers'
import type { AuthResponse } from './types'

interface RefreshAttempt {
  snapshot: AuthenticatedSessionSnapshot
  promise: Promise<AuthResponse>
  appliedSession: AuthenticatedSessionSnapshot | null
}

let refreshAttempt: RefreshAttempt | null = null
const SESSION_CONTEXT_KEY = 'palladinAuthenticatedSession'

/** Bind a request to a previously captured session instead of the send-time session. */
export function authenticatedRequestContext(
  snapshot: AuthenticatedSessionSnapshot,
): { context: Record<string, unknown> } {
  return { context: { [SESSION_CONTEXT_KEY]: snapshot } }
}

/** Backend error key for a 403 caused specifically by an unverified email. */
const EMAIL_NOT_VERIFIED_KEY = 'errors.backend.email-not-verified'

/**
 * True only when a 403 carries the distinguishable email-not-verification key
 * in its `error` field. Parses a clone (so the original body stays intact for
 * the calling query) and matches the field exactly — a substring scan could
 * false-positive on an unrelated 403 that merely mentions the phrase.
 */
async function isEmailNotVerified(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as { error?: string }
    return body?.error === EMAIL_NOT_VERIFIED_KEY
  } catch {
    return false
  }
}

function refreshContextMatches(snapshot: AuthenticatedSessionSnapshot): boolean {
  return authenticatedSessionMatches(snapshot)
}

function assertRefreshResponsePrincipal(
  response: AuthResponse,
  snapshot: AuthenticatedSessionSnapshot,
): void {
  const principal = assertAuthenticatedPrincipal(response)
  if (!snapshot.userId || response.userId !== snapshot.userId) {
    throw new Error('Refresh response user does not match the initiating principal')
  }
  if (!snapshot.organizationId
    || principal.organizationId !== snapshot.organizationId) {
    throw new Error('Refresh response organization does not match the initiating principal')
  }
}

function applyRefreshResponse(
  response: AuthResponse,
  snapshot: AuthenticatedSessionSnapshot,
): AuthenticatedSessionSnapshot | null {
  assertRefreshResponsePrincipal(response, snapshot)
  if (!authenticatedSessionMatches(snapshot)) return null
  useAuthStore.getState().setTokens(response)
  return captureAuthenticatedSession()
}

function getRefreshAttempt(snapshot: AuthenticatedSessionSnapshot): RefreshAttempt {
  if (refreshAttempt && refreshContextMatches(refreshAttempt.snapshot)) {
    return refreshAttempt
  }

  const promise = ky
    .post('api/auth/refresh', {
      prefixUrl: env.apiUrl,
      json: { refreshToken: snapshot.refreshToken },
    })
    .json<AuthResponse>()
  const attempt = { snapshot, promise, appliedSession: null }
  refreshAttempt = attempt
  void promise.finally(() => {
    if (refreshAttempt === attempt) refreshAttempt = null
  }).catch(() => undefined)
  return attempt
}

export const api = ky.create({
  prefixUrl: env.apiUrl,
  hooks: {
    beforeRequest: [
      (request, options) => {
        const headers = getAnalyticsHeaders()
        for (const [key, value] of Object.entries(headers)) {
          request.headers.set(key, value)
        }

        const bound = options.context?.[SESSION_CONTEXT_KEY]
        const snapshot = bound
          ? bound as AuthenticatedSessionSnapshot
          : captureAuthenticatedSession()
        if (snapshot.sessionBoundaryActive
          || (bound && !authenticatedSessionMatches(snapshot))) {
          throw new StaleAuthenticatedSessionError()
        }
        options.context[SESSION_CONTEXT_KEY] = snapshot
        if (snapshot.accessToken) {
          request.headers.set('Authorization', `Bearer ${snapshot.accessToken}`)
        }
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        const requestSnapshot = options.context?.[SESSION_CONTEXT_KEY] as
          | AuthenticatedSessionSnapshot
          | undefined
        if (!requestSnapshot) return response

        // Targeted email-verification backstop. The router gate is the primary
        // mechanism; this only catches the window where a stale in-memory token
        // lets a request through before the gate resolves. The backend marks
        // exactly this case with a distinguishable key — every OTHER 403 (a real
        // permission denial) is left untouched for the caller to handle.
        if (response.status === 403) {
          if (!authenticatedSessionMatches(requestSnapshot)) return response
          if ((await isEmailNotVerified(response))
            && authenticatedSessionMatches(requestSnapshot)) {
            window.location.href = '/verify-email'
          }
          return response
        }

        if (response.status !== 401) return response
        if (!authenticatedSessionMatches(requestSnapshot)) return response

        const { refreshToken } = requestSnapshot
        if (!refreshToken) {
          if (await terminateAuthenticatedSession(requestSnapshot)) {
            window.location.href = buildLoginRedirectHref(window.location.href)
          }
          return response
        }

        const attempt = getRefreshAttempt(requestSnapshot)

        try {
          const data = await attempt.promise
          if (!attempt.appliedSession) {
            attempt.appliedSession = applyRefreshResponse(data, attempt.snapshot)
          }
          const appliedSession = attempt.appliedSession
          if (!appliedSession || !authenticatedSessionMatches(appliedSession)) return response

          // Retry original request with new token
          request.headers.set('Authorization', `Bearer ${data.accessToken}`)
          return ky(request)
        } catch {
          if (refreshContextMatches(attempt.snapshot)) {
            if (await terminateAuthenticatedSession(attempt.snapshot)) {
              window.location.href = buildLoginRedirectHref(window.location.href)
            }
          }
          return response
        }
      },
    ],
  },
})
