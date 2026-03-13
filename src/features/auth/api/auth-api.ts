import { api } from '../../../shared/api/client'
import type { AuthResponse } from '../../../shared/api/types'

export function oauthGoogle(token: string): Promise<AuthResponse> {
  return api
    .post('api/auth/oauth/google', { json: { token, platform: 'web' } })
    .json()
}

export function refreshToken(refreshToken: string): Promise<AuthResponse> {
  return api
    .post('api/auth/refresh', { json: { refreshToken } })
    .json()
}

export function logout(refreshToken: string): Promise<void> {
  return api
    .post('api/auth/logout', { json: { refreshToken } })
    .json()
}
