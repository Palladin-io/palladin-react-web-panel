export interface AuthResponse {
  accessToken: string
  refreshToken: string
  userId: string
  isOnboarded: boolean
  /**
   * Whether the account's email is verified. OAuth sign-ups are always true;
   * password sign-ups are false until the verification link is consumed.
   * Optional so older backends that omit it don't break token parsing.
   */
  emailVerified?: boolean
}
