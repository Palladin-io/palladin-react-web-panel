import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { deriveKey } from '../../shared/crypto/argon2'
import { fromBase64 } from '../../shared/crypto/encoding'
import { decryptWithKey, wipe } from '../../shared/crypto/sodium'
import { getAccount } from '../onboarding/api/account-api'

/**
 * Thrown when the derived master key cannot decrypt the wrapped private key.
 * This is the "wrong password" signal that the UI surfaces inline.
 */
export class IncorrectMasterPasswordError extends Error {
  constructor() {
    super('Incorrect master password')
    this.name = 'IncorrectMasterPasswordError'
  }
}

/**
 * Runs the client-side unlock dance:
 *   1. Pull the user's Argon2 salt + wrapped private key from the server
 *   2. Derive the master key from `password + salt`
 *   3. Decrypt the private key with the master key
 *   4. Hand both keys to the auth store (it copies them internally)
 *
 * The master key is intentionally NOT wiped here — it lives in the auth
 * store for the rest of the session so we can unwrap vault keys on demand.
 * Intermediate buffers (nonce/cipher splits) contain only cipher material
 * and don't require wiping.
 */
export function useUnlock() {
  return useMutation({
    mutationFn: async (password: string) => {
      const account = await getAccount()
      if (!account.salt || !account.encryptedPrivateKey) {
        throw new Error('Account setup incomplete — salt or key missing')
      }
      const saltBytes = fromBase64(account.salt)

      const masterKey = await deriveKey(password, saltBytes)

      let privateKey: Uint8Array | null = null
      try {
        const combined = fromBase64(account.encryptedPrivateKey)

        // decryptWithKey throws on MAC failure — catch and translate into
        // our typed error. Either way, the derived master key is useless
        // and must be wiped before we bail.
        try {
          privateKey = await decryptWithKey(combined, masterKey)
        } catch {
          wipe(masterKey)
          throw new IncorrectMasterPasswordError()
        }

        useAuthStore.getState().unlockVault(masterKey, privateKey)
      } finally {
        // The store holds its own copies — zero our locals so the raw key
        // material doesn't linger beyond this function's stack.
        if (privateKey) wipe(privateKey)
        wipe(masterKey)
      }
    },
  })
}
