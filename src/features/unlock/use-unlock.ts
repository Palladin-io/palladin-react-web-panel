import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { deriveKey } from '../../shared/crypto/argon2'
import {
  assertIdentityKdfProfile,
  decodeAccountSecret,
  deriveIdentityV2,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_SECURITY_VERSION,
  LEGACY_IDENTITY_KDF_PROFILE_ID,
} from '../../shared/crypto/identity-kdf'
import { decodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, wipe } from '../../shared/crypto/sodium'
import { getAccount } from '../../shared/api/account-api'

export class IncorrectMasterPasswordError extends Error {
  constructor() {
    super('Incorrect master password or Account Secret')
    this.name = 'IncorrectMasterPasswordError'
  }
}

export interface UnlockInput {
  password: string
  accountSecret?: string
}

export function useUnlock() {
  return useMutation({
    mutationFn: async ({ password, accountSecret: encodedSecret }: UnlockInput) => {
      const account = await getAccount()
      if (!account.kdf || !account.encryptedPrivateKey) {
        throw new Error('Account setup incomplete')
      }
      if (account.kdf.minimumSecurityVersion > IDENTITY_SECURITY_VERSION) {
        throw new Error('upgrade-required')
      }

      const salt = decodeBase64Url(account.kdf.kdfSalt, 16)
      let accountSecret: Uint8Array | null = null
      let masterKey: Uint8Array | null = null
      let authCredential: Uint8Array | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      try {
        if (account.kdf.securityVersion === IDENTITY_SECURITY_VERSION) {
          assertIdentityKdfProfile({
            ...account.kdf,
            memoryKiB: IDENTITY_KDF_PROFILE.memoryKiB,
            iterations: IDENTITY_KDF_PROFILE.iterations,
            parallelism: IDENTITY_KDF_PROFILE.parallelism,
            accountSecretRequired: true,
          })
          if (account.kdf.profileId !== IDENTITY_KDF_PROFILE_ID || !encodedSecret) {
            throw new IncorrectMasterPasswordError()
          }
          accountSecret = decodeAccountSecret(encodedSecret)
          const identity = await deriveIdentityV2(
            password,
            accountSecret,
            account.userId,
            salt,
          )
          masterKey = identity.masterKey
          authCredential = identity.authCredential
        } else if (account.kdf.securityVersion === 1
          && account.kdf.profileId === LEGACY_IDENTITY_KDF_PROFILE_ID) {
          masterKey = await deriveKey(password, salt)
        } else {
          throw new Error('unsupported-kdf-profile')
        }

        encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
        try {
          privateKey = await decryptWithKey(encryptedPrivateKey, masterKey)
        } catch {
          throw new IncorrectMasterPasswordError()
        }
        useAuthStore.getState().unlockVault(
          masterKey,
          privateKey,
          accountSecret ?? undefined,
        )
        return account.kdf.securityVersion === 1 ? account : null
      } finally {
        wipe(salt)
        if (accountSecret) wipe(accountSecret)
        if (masterKey) wipe(masterKey)
        if (authCredential) wipe(authCredential)
        if (privateKey) wipe(privateKey)
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
      }
    },
  })
}
