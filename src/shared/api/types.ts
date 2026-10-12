export interface AuthResponse {
  accessToken: string
  sessionId: string
  userId: string
  isOnboarded: boolean
  /**
   * Whether the account's email is verified. OAuth sign-ups are always true;
   * password sign-ups are false until the verification link is consumed.
   * Optional so older backends that omit it don't break token parsing.
   */
  emailVerified?: boolean
  /**
   * Active waitlist Developer benefit window. The backend returns both values
   * together and nulls them after expiry. Kept in memory only by auth-store.
   */
  waitlistDeveloperBenefitStartedAt?: string | null
  waitlistDeveloperBenefitEndsAt?: string | null
}
