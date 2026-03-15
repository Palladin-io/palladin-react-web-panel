export interface AuthResponse {
  accessToken: string
  refreshToken: string
  userId: string
  isOnboarded: boolean
  permissions: number
}
