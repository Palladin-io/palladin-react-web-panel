import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deriveKey,
  MASTER_KEY_SALT_BYTES,
  RECOVERY_KEY_SALT_BYTES,
} from '../../shared/crypto/argon2'
import { fromBase64, toBase64 } from '../../shared/crypto/encoding'
import {
  decryptWithKey,
  encryptWithKey,
  randomBytes,
  wipe,
} from '../../shared/crypto/sodium'
import {
  ACCOUNT_QUERY_KEY,
  getAccount,
  recoverAccount,
} from '../../shared/api/account-api'
import { generateRecoveryMnemonic, joinMnemonic } from '../../shared/lib/mnemonic'

/**
 * Thrown when the supplied recovery mnemonic fails to unwrap the server's
 * `encryptedPrivateKeyByRecovery`. This is the "wrong recovery key" signal
 * that the wizard surfaces inline so the user can return to step one.
 */
export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super('Invalid recovery key')
    this.name = 'InvalidRecoveryKeyError'
  }
}

export interface RecoverInput {
  /** 24-word BIP-39 recovery mnemonic typed/pasted by the user. */
  recoveryMnemonic: string[]
  /** New master password the user will unlock with going forward. */
  newPassword: string
}

/**
 * Runs the full client-side account-recovery dance:
 *   1. Derive RK from `mnemonic + recoverySalt`, unwrap the private key.
 *   2. Derive a fresh MK from `newPassword + newSalt`, re-wrap private key.
 *   3. Generate a fresh recovery mnemonic, derive new RK, re-wrap private key.
 *   4. POST all four new salts/ciphertexts to the server in one call.
 *
 * All derived keys and the raw private key are zeroed in `finally` so no
 * secret material lingers past this function's stack frame. Salts, public
 * key, and ciphertexts are not secret and don't need wiping.
 *
 * On success returns the newly generated recovery mnemonic so the UI can
 * display it to the user for safekeeping.
 */
export function useRecover() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recoveryMnemonic, newPassword }: RecoverInput) => {
      const account = await getAccount()
      if (!account.recoverySalt || !account.encryptedPrivateKeyByRecovery) {
        throw new Error('Account is missing recovery material — cannot recover')
      }

      const recoverySaltBytes = fromBase64(account.recoverySalt)
      const recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySaltBytes)

      let privateKey: Uint8Array | null = null
      let newMasterKey: Uint8Array | null = null
      let newRecoveryKey: Uint8Array | null = null
      const newRecoveryMnemonic = generateRecoveryMnemonic()

      try {
        // Step 1: unwrap the private key. A MAC failure here is the canonical
        // "wrong recovery key" signal — translate into a typed error so the
        // wizard can route the user back to step 1.
        try {
          privateKey = await decryptWithKey(
            fromBase64(account.encryptedPrivateKeyByRecovery),
            recoveryKey,
          )
        } catch {
          throw new InvalidRecoveryKeyError()
        }

        // Step 2: re-wrap under a fresh MK derived from the new password.
        const newSalt = await randomBytes(MASTER_KEY_SALT_BYTES)
        newMasterKey = await deriveKey(newPassword, newSalt)
        const newEncryptedPrivateKey = await encryptWithKey(privateKey, newMasterKey)

        // Step 3: re-wrap under a fresh RK derived from a brand-new mnemonic.
        const newRecoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
        newRecoveryKey = await deriveKey(
          joinMnemonic(newRecoveryMnemonic),
          newRecoverySalt,
        )
        const newEncryptedPrivateKeyByRecovery = await encryptWithKey(
          privateKey,
          newRecoveryKey,
        )

        // Step 4: ship everything to the server atomically.
        await recoverAccount({
          newSalt: toBase64(newSalt),
          newEncryptedPrivateKey: toBase64(newEncryptedPrivateKey),
          newRecoverySalt: toBase64(newRecoverySalt),
          newEncryptedPrivateKeyByRecovery: toBase64(newEncryptedPrivateKeyByRecovery),
        })

        return newRecoveryMnemonic
      } finally {
        wipe(recoveryKey)
        if (privateKey) wipe(privateKey)
        if (newMasterKey) wipe(newMasterKey)
        if (newRecoveryKey) wipe(newRecoveryKey)
      }
    },
    onSuccess: () => {
      // The server returned a new salt + new wrapped private keys; the cached
      // account response is stale. Invalidate so the next /unlock fetch picks
      // up the fresh material.
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
