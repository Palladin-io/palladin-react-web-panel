import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AUTH_SALT_BYTES,
  deriveKey,
  MASTER_KEY_SALT_BYTES,
} from '../../../shared/crypto/argon2'
import { fromBase64, toBase64 } from '../../../shared/crypto/encoding'
import { decryptWithKey, encryptWithKey, randomBytes, wipe } from '../../../shared/crypto/sodium'
import {
  ACCOUNT_QUERY_KEY,
  changeMasterPassword,
  getAccount,
} from '../../../shared/api/account-api'
import { useAuthStore } from '../stores/auth-store'

/** Thrown when the supplied current password can't decrypt the private key. */
export class IncorrectCurrentPasswordError extends Error {
  constructor() {
    super('Incorrect current password')
    this.name = 'IncorrectCurrentPasswordError'
  }
}

export interface ChangeMasterPasswordInput {
  currentPassword: string
  newPassword: string
}

/**
 * Change the master password while authenticated (Variant A: the login password
 * IS the master password).
 *
 *   1. Verify the current password by re-deriving the current MK and unwrapping
 *      the private key (a MAC failure is the "wrong current password" signal).
 *   2. Derive a fresh MK (new salt) and a fresh authHash (new authSalt) from the
 *      new password.
 *   3. Re-wrap the SAME private key under the new MK and ship the new master +
 *      auth material. Recovery is deliberately untouched — this flow doesn't
 *      hold the recovery mnemonic, so the existing recovery wrapping and phrase
 *      keep working.
 *   4. Update the in-memory MK so the session continues seamlessly.
 *
 * All key material is zeroed in `finally`.
 */
export function useChangeMasterPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangeMasterPasswordInput) => {
      const account = await getAccount()
      if (!account.salt || !account.encryptedPrivateKey) {
        throw new Error('Account is missing key material — cannot change password')
      }

      const currentMasterKey = await deriveKey(currentPassword, fromBase64(account.salt))

      let privateKey: Uint8Array | null = null
      let newMasterKey: Uint8Array | null = null
      let newAuthHash: Uint8Array | null = null
      try {
        try {
          privateKey = await decryptWithKey(
            fromBase64(account.encryptedPrivateKey),
            currentMasterKey,
          )
        } catch {
          throw new IncorrectCurrentPasswordError()
        }

        const newSalt = await randomBytes(MASTER_KEY_SALT_BYTES)
        const newAuthSalt = await randomBytes(AUTH_SALT_BYTES)
        newMasterKey = await deriveKey(newPassword, newSalt)
        newAuthHash = await deriveKey(newPassword, newAuthSalt)

        const newEncryptedPrivateKey = await encryptWithKey(privateKey, newMasterKey)

        await changeMasterPassword({
          salt: toBase64(newSalt),
          encryptedPrivateKey: toBase64(newEncryptedPrivateKey),
          authHash: toBase64(newAuthHash),
          authSalt: toBase64(newAuthSalt),
        })

        // Keep the session live under the new MK (private key is unchanged).
        // Pass copies — the `finally` wipes the originals.
        useAuthStore
          .getState()
          .unlockVault(new Uint8Array(newMasterKey), new Uint8Array(privateKey))
      } finally {
        wipe(currentMasterKey)
        if (privateKey) wipe(privateKey)
        if (newMasterKey) wipe(newMasterKey)
        if (newAuthHash) wipe(newAuthHash)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
