import ky from 'ky'
import { env } from '../lib/env'
import { useAuthStore } from '../../features/auth'
import { getAnalyticsHeaders } from './analytics-headers'
import type { AuthResponse } from './types'

let refreshPromise: Promise<AuthResponse> | null = null

export const api = ky.create({
  prefixUrl: env.apiUrl,
  hooks: {
    beforeRequest: [
      (request) => {
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
      async (request, _options, response) => {
        if (response.status !== 401) return response

        const { refreshToken, setTokens } = useAuthStore.getState()
        if (!refreshToken) {
          useAuthStore.getState().logout()
          window.location.href = '/login'
          return response
        }

        if (!refreshPromise) {
          refreshPromise = ky
            .post('api/auth/refresh', {
              prefixUrl: env.apiUrl,
              json: { refreshToken },
            })
            .json<AuthResponse>()
            .finally(() => {
              refreshPromise = null
            })
        }

        try {
          const data = await refreshPromise
          setTokens(data)

          // Retry original request with new token
          request.headers.set('Authorization', `Bearer ${data.accessToken}`)
          return ky(request)
        } catch {
          // Refresh failed (expired/revoked refresh token) → force logout.
          // `refreshPromise` already serialises concurrent 401s onto one failed
          // promise, and `logout()` is idempotent (resets to initial state), so
          // an unconditional call is safe. We must NOT gate this on `accessToken`
          // — it lives in memory only and is always null after a reload, which
          // would otherwise strand the user on a broken-authed page.
          useAuthStore.getState().logout()
          window.location.href = '/login'
          return response
        }
      },
    ],
  },
})
