import { HTTPError } from 'ky'
import { api } from '../../../shared/api/client'
import type { AuthResponse } from '../../../shared/api/types'
import { clearClientSession } from '../session/client-session'

export function oauthGoogle(token: string): Promise<AuthResponse> {
  return api.post('api/auth/oauth/google', { json: { token } }).json()
}

// ─── Email + password (Variant A: login password IS the master password) ──────

/**
 * Registration payload. Reuses the `SetupAccount` crypto material verbatim
 * The v3 client derives one Argon2id account root from the password, then
 * domain-separates an authentication credential and master key. Only the
 * authentication credential and opaque wrapped key material cross the network.
 */
export interface RegisterPayload {
  accountId: string
  email: string
  displayName: string
  preferredLanguage?: string
  securityVersion: number
  kdfProfileId: string
  authCredential: string
  kdfSalt: string
  recoverySalt: string
  publicKey: string
  encryptedPrivateKey: string
  encryptedPrivateKeyByRecovery: string
}

/** Login response when TOTP is enabled: no tokens yet, a short-lived challenge. */
export interface TotpRequiredResponse {
  totpRequired: true
  /** Single-use, ~5 min token that authorizes the TOTP step. */
  challengeToken: string
}

export type PasswordLoginResponse = AuthResponse | TotpRequiredResponse

export class AuthRateLimitError extends Error {
  readonly retryAfterSeconds: number | null

  constructor(retryAfterSeconds: number | null) {
    super('auth-rate-limited')
    this.name = 'AuthRateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('Retry-After')
  if (!header) return null

  const seconds = Number(header)
  if (Number.isInteger(seconds) && seconds > 0) return seconds

  const retryAt = Date.parse(header)
  if (Number.isNaN(retryAt)) return null
  return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))
}

async function mapAuthRateLimit<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 429) {
      throw new AuthRateLimitError(retryAfterSeconds(error.response))
    }
    throw error
  }
}

export function isTotpRequired(
  response: PasswordLoginResponse,
): response is TotpRequiredResponse {
  return (response as TotpRequiredResponse).totpRequired === true
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return api.post('api/auth/register', { json: payload }).json()
}

/**
 * Pre-login KDF bootstrap. Unknown emails receive an indistinguishable
 * pseudo-profile response (anti-enumeration), never a 404.
 */
export interface LoginKdfBootstrap {
  accountId: string
  profileId: string
  securityVersion: number
  kdfSalt: string
  memoryKiB: number
  iterations: number
  parallelism: number
}

export function fetchLoginKdf(
  email: string,
  profileId: string,
): Promise<LoginKdfBootstrap> {
  return mapAuthRateLimit(
    api.post('api/auth/login/salt', { json: { email, profileId } }).json(),
  )
}

export function passwordLogin(input: {
  email: string
  securityVersion: number
  kdfProfileId: string
  authCredential: string
}): Promise<PasswordLoginResponse> {
  return mapAuthRateLimit(api.post('api/auth/login', { json: input }).json())
}

/**
 * Second login factor. `code` is either a 6-digit TOTP code or a recovery code
 * — the server accepts both on this endpoint.
 */
export function totpLogin(input: {
  challengeToken: string
  code: string
}): Promise<AuthResponse> {
  return mapAuthRateLimit(api.post('api/auth/login/totp', { json: input }).json())
}

// ─── Email verification ───────────────────────────────────────────────────────

export interface VerifyEmailResponse {
  status: string
  userId: string
  waitlistDeveloperBenefitStartedAt?: string | null
  waitlistDeveloperBenefitEndsAt?: string | null
}

export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return api.post('api/auth/verify-email', { json: { token } }).json()
}

/** Resend the verification email (JWT). 202 when sent, 204 no-op if already verified. */
export function resendVerificationEmail(): Promise<void> {
  return api.post('api/auth/verify-email/resend').json<void>()
}

// ─── TOTP enrollment (JWT) ────────────────────────────────────────────────────

export interface TotpEnrollResponse {
  /** base32 shared secret, shown for manual entry. */
  secret: string
  /** otpauth:// URI encoded into the QR code. */
  otpauthUri: string
}

export interface TotpConfirmResponse {
  /** One-time recovery codes — shown once, only hashes stored server-side. */
  recoveryCodes: string[]
}

export function enrollTotp(): Promise<TotpEnrollResponse> {
  return api.post('api/auth/totp/enroll').json()
}

export function confirmTotp(code: string): Promise<TotpConfirmResponse> {
  return api.post('api/auth/totp/confirm', { json: { code } }).json()
}

export function disableTotp(code: string): Promise<void> {
  return api.post('api/auth/totp/disable', { json: { code } }).json<void>()
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
    clearClientSession()
  }
}
