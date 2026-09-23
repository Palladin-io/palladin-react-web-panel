import ky from 'ky'
import { env } from '../lib/env'
import { buildLoginRedirectHref } from '../lib/auth-redirect'
import { useAuthStore } from '../../features/auth/stores/auth-store'
import {
  captureClientSessionGeneration,
  clearClientSession,
  clientSessionGenerationMatches,
} from '../../features/auth/session/client-session'
import { getAnalyticsHeaders } from './analytics-headers'
import type { AuthResponse } from './types'

interface RefreshAttempt {
  generation: number
  refreshToken: string
  promise: Promise<AuthResponse>
}

let refreshAttempt: RefreshAttempt | null = null
const requestSessionGenerations = new WeakMap<object, number>()

function getRefreshAttempt(generation: number, refreshToken: string): RefreshAttempt {
  if (refreshAttempt
    && refreshAttempt.generation === generation
    && refreshAttempt.refreshToken === refreshToken) {
    return refreshAttempt
  }
  const attempt: RefreshAttempt = {
    generation,
    refreshToken,
    promise: ky
      .post('api/auth/refresh', {
        prefixUrl: env.apiUrl,
        json: { refreshToken },
      })
      .json<AuthResponse>(),
  }
  refreshAttempt = attempt
  void attempt.promise.finally(() => {
    if (refreshAttempt === attempt) refreshAttempt = null
  }).catch(() => undefined)
  return attempt
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

export const api = ky.create({
  prefixUrl: env.apiUrl,
  hooks: {
    beforeRequest: [
      (request, options) => {
        const generation = requestSessionGenerations.get(options)
        if (generation === undefined) {
          requestSessionGenerations.set(options, captureClientSessionGeneration())
        } else if (!clientSessionGenerationMatches(generation)) {
          return new Response(null, { status: 409, statusText: 'Stale Client Session' })
        }
        const headers = getAnalyticsHeaders()
        for (const [key, value] of Object.entries(headers)) {
          request.headers.set(key, value)
        }

        const { accessToken } = useAuthStore.getState()
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`)
        }
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        const generation = requestSessionGenerations.get(options)
        if (generation === undefined || !clientSessionGenerationMatches(generation)) {
          return response
        }

        // Targeted email-verification backstop. The router gate is the primary
        // mechanism; this only catches the window where a stale in-memory token
        // lets a request through before the gate resolves. The backend marks
        // exactly this case with a distinguishable key — every OTHER 403 (a real
        // permission denial) is left untouched for the caller to handle.
        if (response.status === 403
          && (await isEmailNotVerified(response))
          && clientSessionGenerationMatches(generation)) {
          window.location.href = '/verify-email'
          return response
        }

        if (response.status !== 401) return response

        const { refreshToken, setTokens } = useAuthStore.getState()
        if (!refreshToken) {
          await clearClientSession()
          window.location.href = buildLoginRedirectHref(window.location.href)
          return response
        }

        const attempt = getRefreshAttempt(generation, refreshToken)

        try {
          const data = await attempt.promise
          if (!clientSessionGenerationMatches(attempt.generation)
            || useAuthStore.getState().refreshToken !== attempt.refreshToken) {
            return response
          }
          setTokens(data)
          if (request.signal.aborted) return response

          // Retry original request with new token
          request.headers.set('Authorization', `Bearer ${data.accessToken}`)
          return ky(request)
        } catch {
          if (clientSessionGenerationMatches(attempt.generation)
            && useAuthStore.getState().refreshToken === attempt.refreshToken) {
            await clearClientSession()
            window.location.href = buildLoginRedirectHref(window.location.href)
          }
          return response
        }
      },
    ],
  },
})
