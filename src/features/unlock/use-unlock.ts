import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import {
  assertIdentityKdfProfile,
  deriveIdentityV1,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_SECURITY_VERSION,
} from '../../shared/crypto/identity-kdf'
import { decodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, wipe } from '../../shared/crypto/sodium'
import { getAccount } from '../../shared/api/account-api'

export class IncorrectMasterPasswordError extends Error {
  constructor() {
    super('Incorrect master password')
    this.name = 'IncorrectMasterPasswordError'
  }
}

export interface UnlockInput {
  password: string
}

export function useUnlock() {
  return useMutation({
    mutationFn: async ({ password }: UnlockInput) => {
      const account = await getAccount()
      if (!account.kdf || !account.encryptedPrivateKey) {
        throw new Error('Account setup incomplete')
      }
      if (account.kdf.minimumSecurityVersion > IDENTITY_SECURITY_VERSION) {
        throw new Error('upgrade-required')
      }

      const salt = decodeBase64Url(account.kdf.kdfSalt, 16)
      let masterKey: Uint8Array | null = null
      let authCredential: Uint8Array | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      try {
        if (account.kdf.securityVersion !== IDENTITY_SECURITY_VERSION
          || account.kdf.profileId !== IDENTITY_KDF_PROFILE_ID) {
          throw new Error('unsupported-kdf-profile')
        }
        assertIdentityKdfProfile({
          ...account.kdf,
          memoryKiB: IDENTITY_KDF_PROFILE.memoryKiB,
          iterations: IDENTITY_KDF_PROFILE.iterations,
          parallelism: IDENTITY_KDF_PROFILE.parallelism,
        })
        const identity = await deriveIdentityV1(password, account.userId, salt)
        masterKey = identity.masterKey
        authCredential = identity.authCredential

        encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
        try {
          privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
        } catch {
          throw new IncorrectMasterPasswordError()
        }
        useAuthStore.getState().unlockVault(
          masterKey,
          privateKey,
        )
      } finally {
        wipe(salt)
        if (masterKey) wipe(masterKey)
        if (authCredential) wipe(authCredential)
        if (privateKey) wipe(privateKey)
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
      }
    },
  })
}
