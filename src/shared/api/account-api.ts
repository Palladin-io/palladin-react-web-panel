import { api } from './client'

export interface AccountResponse {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
  /** Backend field indicating account setup is complete. */
  isOnboarded: boolean
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
