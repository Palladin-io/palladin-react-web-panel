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
   * Optional — older backends omit it; consumers default to `true` so the
   * verify banner never shows for accounts the server can't report on.
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
}

export interface SetupAccountPayload {
  /** base64-encoded 16-byte Argon2id salt for the master password (MK derivation). */
  salt: string
  /** base64-encoded 16-byte Argon2id salt for the recovery mnemonic (RK derivation). */
  recoverySalt: string
  /** base64-encoded X25519 public key. */
  publicKey: string
  /** base64-encoded private key encrypted with the master key (nonce prepended). */
  encryptedPrivateKey: string
  /** base64-encoded private key encrypted with the recovery key (nonce prepended). */
  encryptedPrivateKeyByRecovery: string
}

export interface RecoverAccountPayload {
  /** base64-encoded 16-byte Argon2id salt for the new master password. */
  newSalt: string
  /** base64-encoded private key re-wrapped with the new master key. */
  newEncryptedPrivateKey: string
  /** base64-encoded 16-byte Argon2id salt for the new recovery mnemonic. */
  newRecoverySalt: string
  /** base64-encoded private key re-wrapped with the new recovery key. */
  newEncryptedPrivateKeyByRecovery: string
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
 * password is the master password). The client re-derives both keys from the
 * new password and ships the fresh master-side material + the new auth
 * credential. Recovery material is deliberately NOT included — a change-password
 * flow doesn't hold the recovery mnemonic, so the recovery wrapping is left
 * untouched and the old recovery phrase keeps working.
 */
export interface ChangeMasterPasswordPayload {
  /** base64 new 16-byte Argon2id salt for the new master key. */
  salt: string
  /** base64 private key re-wrapped with the new master key (nonce prepended). */
  encryptedPrivateKey: string
  /** base64 new Argon2id auth-hash sent to the server (server re-hashes at rest). */
  authHash: string
  /** base64 new 16-byte salt used to derive `authHash` (returned pre-login). */
  authSalt: string
}

/**
 * Change the master password while authenticated. Endpoint pending backend
 * confirmation (CVT-268) — expected to be a JWT-authed route that updates the
 * master + auth material without touching recovery.
 */
export function changeMasterPassword(
  payload: ChangeMasterPasswordPayload,
): Promise<void> {
  return api.put('api/account/master-password', { json: payload }).json<void>()
}

/**
 * Payload for the idempotent default-vault creation endpoint.
 * Same fields as a regular vault creation; the server enforces the
 * one-per-account rule and returns 409 if one already exists.
 */
export interface DefaultVaultPayload {
  name: string
  description?: string
  icon?: string
  color?: string
  grantMode: number
  /** base64-encoded sealed-box vault key (same as CreateVaultPayload). */
  wrappedVK: string
}

/**
 * POST /api/account/default-vault — creates the user's default vault.
 * The backend returns 201 on first call and 409 when one already exists.
 * Callers must handle 409 as a success (idempotent).
 */
export async function createDefaultVault(payload: DefaultVaultPayload): Promise<void> {
  await api.post('api/account/default-vault', { json: payload })
}
