import { api } from '../../../shared/api/client'

export interface AccountResponse {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
  hasPublicKey: boolean
}

export interface SetupAccountPayload {
  /** base64-encoded 16-byte Argon2id salt for the master password. */
  salt: string
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
