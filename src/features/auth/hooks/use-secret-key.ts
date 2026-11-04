import { useMutation, useQuery } from '@tanstack/react-query'
import { getAccount } from '../../../shared/api/account-api'
import { deriveAccountIdentity, SecretKeyRequiredError, type IdentityKdfOutputs } from '../../../shared/crypto/identity-kdf'
import {
  emergencyKitMaterial,
  forgetDeviceSecretKey,
  loadDeviceSecretKey,
  type EmergencyKitMaterial,
} from '../../../shared/crypto/secret-key'
import { decryptWithKey, wipe } from '../../../shared/crypto/sodium'
import { decodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { IncorrectCurrentPasswordError } from './use-change-master-password'

export const DEVICE_SECRET_KEY_QUERY_KEY = ['device-secret-key'] as const

/** Whether this browser holds a wrapped Secret Key for the account; never returns the key. */
export function useDeviceSecretKeyStatus(accountId: string | undefined) {
  return useQuery({
    queryKey: [...DEVICE_SECRET_KEY_QUERY_KEY, accountId],
    enabled: Boolean(accountId),
    queryFn: async () => {
      const secret = await loadDeviceSecretKey(accountId!)
      if (!secret) return false
      wipe(secret)
      return true
    },
    staleTime: Infinity,
    gcTime: 0,
  })
}

/**
 * Re-download of the Emergency Kit. The password is verified locally by
 * opening the Member private key wrap, so a stolen session alone never shows the kit.
 */
export function useRevealEmergencyKit() {
  return useMutation({
    mutationFn: async (password: string): Promise<EmergencyKitMaterial> => {
      const account = await getAccount()
      if (!account.kdf || !account.encryptedPrivateKey) throw new Error('Account is missing versioned key material')
      const accountSecret = await loadDeviceSecretKey(account.userId)
      if (!accountSecret) throw new SecretKeyRequiredError(account.userId)
      let identity: IdentityKdfOutputs | null = null
      let ciphertext: Uint8Array | null = null
      try {
        identity = await deriveAccountIdentity({ password, accountId: account.userId, kdf: account.kdf, accountSecret })
        ciphertext = decodeBase64Url(account.encryptedPrivateKey, 4096)
        try {
          wipe(await decryptWithKey(ciphertext, identity.masterKey))
        } catch {
          throw new IncorrectCurrentPasswordError()
        }
        return emergencyKitMaterial(account.userId, account.email, accountSecret)
      } finally {
        wipe(accountSecret)
        if (ciphertext) wipe(ciphertext)
        if (identity) { wipe(identity.masterKey); wipe(identity.authCredential) }
      }
    },
  })
}

export function useForgetThisBrowser() {
  return useMutation({ mutationFn: (accountId: string) => forgetDeviceSecretKey(accountId) })
}
