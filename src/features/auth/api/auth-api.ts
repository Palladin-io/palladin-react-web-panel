import { api } from '../../../shared/api/client'
import type { SetupAccountPayload } from '../../../shared/api/account-api'
import type { AuthResponse } from '../../../shared/api/types'
import { useAuthStore } from '../stores/auth-store'

export function oauthGoogle(token: string): Promise<AuthResponse> {
  return api
    .post('api/auth/oauth/google', { json: { token, platform: 'web' } })
    .json()
}

// ─── Email + password (Variant A: login password IS the master password) ──────

/**
 * Registration payload. Reuses the `SetupAccount` crypto material verbatim
 * (salt, recoverySalt, publicKey, encryptedPrivateKey,
 * encryptedPrivateKeyByRecovery) and adds the auth credential:
 *   • authHash — Argon2id(password, authSalt), the only password-derived value
 *     that ever reaches the server; it re-hashes it at rest.
 *   • authSalt — the salt for authHash, returned pre-login so the client can
 *     re-derive the same authHash.
 * The master key is derived from the SAME password + `salt` and NEVER leaves
 * the client.
 */
export interface RegisterPayload extends SetupAccountPayload {
  email: string
  displayName: string
  /** "pl" | "en" — defaults to en server-side when omitted. */
  preferredLanguage?: string
  authHash: string
  authSalt: string
}

/** Login response when TOTP is enabled: no tokens yet, a short-lived challenge. */
export interface TotpRequiredResponse {
  totpRequired: true
  /** Single-use, ~5 min token that authorizes the TOTP step. */
  challengeToken: string
}

export type PasswordLoginResponse = AuthResponse | TotpRequiredResponse

export function isTotpRequired(
  response: PasswordLoginResponse,
): response is TotpRequiredResponse {
  return (response as TotpRequiredResponse).totpRequired === true
}

export function register(payload: RegisterPayload): Promise<AuthResponse> {
  return api.post('api/auth/register', { json: payload }).json()
}

/**
 * Pre-login salt fetch. The client needs `authSalt` to derive `authHash`
 * before it can call login. Unknown emails return a deterministic
 * pseudo-random salt (anti-enumeration) — never a 404.
 */
export function fetchLoginSalt(email: string): Promise<{ authSalt: string }> {
  return api.post('api/auth/login/salt', { json: { email } }).json()
}

export function passwordLogin(input: {
  email: string
  authHash: string
}): Promise<PasswordLoginResponse> {
  return api.post('api/auth/login', { json: input }).json()
}

/**
 * Second login factor. `code` is either a 6-digit TOTP code or a recovery code
 * — the server accepts both on this endpoint.
 */
export function totpLogin(input: {
  challengeToken: string
  code: string
}): Promise<AuthResponse> {
  return api.post('api/auth/login/totp', { json: input }).json()
}

// ─── Email verification ───────────────────────────────────────────────────────

export interface VerifyEmailResponse {
  status: string
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
    useAuthStore.getState().logout()
  }
}
