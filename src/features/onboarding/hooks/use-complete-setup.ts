import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { deriveKey, MASTER_KEY_SALT_BYTES } from '../../../shared/crypto/argon2'
import { toBase64 } from '../../../shared/crypto/encoding'
import {
  encryptWithKey,
  generateKeyPair,
  randomBytes,
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
  const authState = useAuthStore()

  return useMutation({
    mutationFn: async ({ masterPassword, recoveryMnemonic }: CompleteSetupInput) => {
      const salt = await randomBytes(MASTER_KEY_SALT_BYTES)
      const masterKey = await deriveKey(masterPassword, salt)

      const keyPair = await generateKeyPair()
      const encryptedPrivateKey = await encryptWithKey(keyPair.privateKey, masterKey)

      const recoverySalt = await randomBytes(MASTER_KEY_SALT_BYTES)
      const recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)
      const encryptedPrivateKeyByRecovery = await encryptWithKey(
        keyPair.privateKey,
        recoveryKey,
      )

      await setupAccount({
        salt: toBase64(concat(salt, recoverySalt)),
        publicKey: toBase64(keyPair.publicKey),
        encryptedPrivateKey: toBase64(encryptedPrivateKey),
        encryptedPrivateKeyByRecovery: toBase64(encryptedPrivateKeyByRecovery),
      })
    },
    onSuccess: () => {
      // Reflect onboarding in the auth store so /_authenticated/ stops
      // rendering the wizard on the next render.
      if (authState.accessToken && authState.refreshToken && authState.userId) {
        authState.setTokens({
          accessToken: authState.accessToken,
          refreshToken: authState.refreshToken,
          userId: authState.userId,
          isOnboarded: true,
          permissions: authState.permissions,
        })
      }
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}

/**
 * Concatenate master salt and recovery salt into a single blob the backend
 * can round-trip. The first half is the master-password salt, the second
 * half the recovery-key salt — unlock/recovery flows split it the same way.
 */
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}
