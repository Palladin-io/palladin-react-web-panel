import ky from 'ky'
import { env } from '../lib/env'
import { useAuthStore } from '../../features/auth'
import type { AuthResponse } from './types'

let isRefreshing = false
let refreshPromise: Promise<AuthResponse> | null = null

export const api = ky.create({
  prefixUrl: env.apiUrl,
  hooks: {
    beforeRequest: [
      (request) => {
        const { accessToken } = useAuthStore.getState()
        if (accessToken) {
          request.headers.set('Authorization', `Bearer ${accessToken}`)
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status !== 401) return response

        const { refreshToken, logout, setTokens } = useAuthStore.getState()
        if (!refreshToken) {
          logout()
          window.location.href = '/login'
          return response
        }

        try {
          if (!isRefreshing) {
            isRefreshing = true
            refreshPromise = ky
              .post('api/auth/refresh', {
                prefixUrl: env.apiUrl,
                json: { refreshToken },
              })
              .json<AuthResponse>()
          }

          const data = await refreshPromise!
          setTokens(data)
          isRefreshing = false
          refreshPromise = null

          // Retry original request with new token
          request.headers.set('Authorization', `Bearer ${data.accessToken}`)
          return ky(request)
        } catch {
          isRefreshing = false
          refreshPromise = null
          logout()
          window.location.href = '/login'
          return response
        }
      },
    ],
  },
})
