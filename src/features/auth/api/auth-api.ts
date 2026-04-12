import { api } from '../../../shared/api/client'
import type { AuthResponse } from '../../../shared/api/types'
import { useAuthStore } from '../stores/auth-store'

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

export async function logout(refreshToken: string): Promise<void> {
  try {
    await api.post('api/auth/logout', { json: { refreshToken } }).json()
  } finally {
    useAuthStore.getState().logout()
  }
}
