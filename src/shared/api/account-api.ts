import { api } from './client'

export interface AccountResponse {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
  /** Backend field indicating account setup is complete. */
  isOnboarded: boolean
  /**
   * Whether the account's email is verified. OAuth accounts are always true.
   * Server-authoritative half of the hard email-verification gate. Optional —
   * older backends omit it; consumers treat only an explicit `false` as
   * unverified (unknown/undefined never gates), so an account the server can't
   * report on is never locked out.
   */
  emailVerified?: boolean
  /**
   * Whether TOTP two-factor authentication is enabled on the account. Optional —
   * older backends omit it; the security screen defaults it to `false`.
   */
  totpEnabled?: boolean
  /**
   * Server-derived onboarding step completion. Optional — older backends omit
   * it; consumers default each flag to `false`. `mobileRegistered` is the only
   * step the client can't derive locally (it needs the user's push devices).
   */
  onboardingSteps?: {
    vaultCreated: boolean
    apiKeyCreated: boolean
    agentEnrolled: boolean
    mobileRegistered: boolean
  }
  /**
   * base64-encoded 16-byte Argon2id salt for master-key derivation.
   * Present once the user has completed onboarding.
   */
  salt?: string
  /**
   * base64-encoded private key wrapped with the master key
   * (layout: `nonce || ciphertext`, matching `encryptWithKey`).
   * Present once the user has completed onboarding.
   */
  encryptedPrivateKey?: string
  /**
   * base64-encoded 16-byte Argon2id salt for recovery-key derivation.
   * Present once the user has completed onboarding.
   */
  recoverySalt?: string
  /**
   * base64-encoded private key wrapped with the recovery key
   * (layout: `nonce || ciphertext`, matching `encryptWithKey`).
   * Present once the user has completed onboarding — consumed by
   * the recovery flow to re-wrap the private key with a new MK.
   */
  encryptedPrivateKeyByRecovery?: string
  /** Current server-authoritative X25519 Member public-key version. */
  memberKeyVersion?: number | null
  kdf?: IdentityKdfState | null
}

export interface IdentityKdfState {
  securityVersion: number
  minimumSecurityVersion: number
  profileId: string
  kdfSalt: string
  credentialRevision: number
  privateKeyWrapRevision: number
  deviceWrapperMetadata: string | null
}

export interface SetupAccountPayload {
  securityVersion: number
  kdfProfileId: string
  kdfSalt: string
  recoverySalt: string
  publicKey: string
  encryptedPrivateKey: string
  encryptedPrivateKeyByRecovery: string
  currentAuthCredential?: string
  newAuthCredential?: string
}

export interface RecoverAccountPayload {
  securityVersion: number
  kdfProfileId: string
  baseCredentialRevision: number
  basePrivateKeyWrapRevision: number
  newKdfSalt: string
  newEncryptedPrivateKey: string
  newRecoverySalt: string
  newEncryptedPrivateKeyByRecovery: string
  newAuthCredential?: string
}

/** TanStack Query key for the account resource — shared across features. */
export const ACCOUNT_QUERY_KEY = ['account'] as const

export function getAccount(): Promise<AccountResponse> {
  return api.get('api/account').json<AccountResponse>()
}

export function setupAccount(payload: SetupAccountPayload): Promise<void> {
  return api.post('api/account/setup', { json: payload }).json<void>()
}

/**
 * Rotate the master password by uploading a private key re-wrapped with
 * a fresh MK and a fresh recovery key. The server replaces all four
 * salt/ciphertext fields atomically; the user's public key is unchanged
 * so existing vault entries remain decryptable after the next unlock.
 */
export function recoverAccount(payload: RecoverAccountPayload): Promise<void> {
  return api.put('api/account/recovery', { json: payload }).json<void>()
}

/**
 * Payload for an authenticated master-password change (Variant A: the login
 * password is the master password). The client proves knowledge of the current
 * password via `currentAuthCredential` (server verifies constant-time before applying
 * — a stolen JWT alone can't rewrite key material) and ships fresh master-side
 * material + the new auth credential. Recovery material is deliberately NOT
 * included — this flow doesn't hold the recovery mnemonic, so the recovery
 * wrapping and the old recovery phrase keep working.
 */
export interface ChangeMasterPasswordPayload {
  securityVersion: number
  kdfProfileId: string
  baseCredentialRevision: number
  basePrivateKeyWrapRevision: number
  currentAuthCredential: string
  newAuthCredential: string
  newKdfSalt: string
  newEncryptedPrivateKey: string
}

/**
 * Change the master password while authenticated. Server verifies
 * `currentAuthCredential`, replaces the master + auth material (recovery untouched),
 * and revokes the account's other sessions.
 */
export function changeMasterPassword(
  payload: ChangeMasterPasswordPayload,
): Promise<void> {
  return api.put('api/account/password', { json: payload }).json<void>()
}

/**
 * Payload for the idempotent default-vault creation endpoint.
 * Same fields as a regular vault creation; the server enforces the
 * one-per-account rule and returns 409 if one already exists.
 */
export type DefaultVaultPayload = Awaited<ReturnType<typeof import('../crypto/create-vault-protocol').createVaultProtocolPayload>>

/**
 * POST /api/account/default-vault — creates the user's default vault.
 * The backend returns 201 on first call and 409 when one already exists.
 * Callers must handle 409 as a success (idempotent).
 */
export async function createDefaultVault(payload: DefaultVaultPayload, signal?: AbortSignal): Promise<void> {
  await api.post('api/account/default-vault', { json: payload, signal, retry: 0 })
}
