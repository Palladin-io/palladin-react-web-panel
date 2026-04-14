import { api } from '../../../shared/api/client'

export interface AccountResponse {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
  hasPublicKey: boolean
  /**
   * base64-encoded 16-byte Argon2id salt for master-key derivation.
   * Present once the user has completed onboarding.
   */
  salt: string
  /**
   * base64-encoded private key wrapped with the master key
   * (layout: `nonce || ciphertext`, matching `encryptWithKey`).
   * Present once the user has completed onboarding.
   */
  encryptedPrivateKey: string
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

export function getAccount(): Promise<AccountResponse> {
  return api.get('api/account').json<AccountResponse>()
}

export function setupAccount(payload: SetupAccountPayload): Promise<void> {
  return api.post('api/account/setup', { json: payload }).json<void>()
}
