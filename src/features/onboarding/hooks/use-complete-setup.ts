import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import {
  deriveKey,
  MASTER_KEY_SALT_BYTES,
  RECOVERY_KEY_SALT_BYTES,
} from '../../../shared/crypto/argon2'
import { toBase64 } from '../../../shared/crypto/encoding'
import {
  encryptWithKey,
  generateKeyPair,
  randomBytes,
  wipe,
} from '../../../shared/crypto/sodium'
import { setupAccount } from '../api/account-api'
import { joinMnemonic } from '../lib/mnemonic'
import { ACCOUNT_QUERY_KEY } from './use-account'

export interface CompleteSetupInput {
  masterPassword: string
  recoveryMnemonic: string[]
}

/**
 * Performs the full client-side key-setup dance and posts the resulting
 * public key + wrapped private keys to the server. Everything secret
 * (password, mnemonic, derived keys, raw private key) lives only in this
 * function's stack frame; nothing is persisted locally.
 */
export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ masterPassword, recoveryMnemonic }: CompleteSetupInput) => {
      const salt = await randomBytes(MASTER_KEY_SALT_BYTES)
      const masterKey = await deriveKey(masterPassword, salt)

      const keyPair = await generateKeyPair()
      const recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
      const recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)

      try {
        const encryptedPrivateKey = await encryptWithKey(keyPair.privateKey, masterKey)
        const encryptedPrivateKeyByRecovery = await encryptWithKey(
          keyPair.privateKey,
          recoveryKey,
        )

        await setupAccount({
          salt: toBase64(salt),
          recoverySalt: toBase64(recoverySalt),
          publicKey: toBase64(keyPair.publicKey),
          encryptedPrivateKey: toBase64(encryptedPrivateKey),
          encryptedPrivateKeyByRecovery: toBase64(encryptedPrivateKeyByRecovery),
        })
      } finally {
        // Zero out all key material regardless of success/failure so the
        // derived keys and raw private key don't linger in memory. Salts,
        // public key, and ciphertexts are not secret and don't need wiping.
        wipe(masterKey)
        wipe(recoveryKey)
        wipe(keyPair.privateKey)
      }
    },
    onSuccess: () => {
      // Reflect onboarding in the auth store so /_authenticated/ stops
      // rendering the wizard on the next render. Use getState() to avoid
      // re-subscribing this hook to the whole store.
      useAuthStore.getState().markOnboarded()
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
