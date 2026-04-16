import { z } from 'zod'
import { api } from '../../../shared/api/client'

export const AccountResponseSchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  hasPublicKey: z.boolean(),
  /** base64-encoded 16-byte Argon2id salt for master-key derivation. */
  salt: z.string().optional(),
  /** base64-encoded private key wrapped with the master key (nonce || ciphertext). */
  encryptedPrivateKey: z.string().optional(),
})

export type AccountResponse = z.infer<typeof AccountResponseSchema>

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

export async function getAccount(): Promise<AccountResponse> {
  const data = await api.get('api/account').json<unknown>()
  return AccountResponseSchema.parse(data)
}

export function setupAccount(payload: SetupAccountPayload): Promise<void> {
  return api.post('api/account/setup', { json: payload }).json<void>()
}
