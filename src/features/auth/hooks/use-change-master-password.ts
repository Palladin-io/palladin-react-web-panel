import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CURRENT_IDENTITY_PROFILE,
  deriveAccountIdentity,
  identityProfileVersion,
  IDENTITY_KDF_SALT_BYTES,
  SecretKeyRequiredError,
  type IdentityKdfOutputs,
} from '../../../shared/crypto/identity-kdf'
import { loadDeviceSecretKey } from '../../../shared/crypto/secret-key'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, encryptWithKey, randomBytes, wipe } from '../../../shared/crypto/sodium'
import {
  ACCOUNT_QUERY_KEY,
  changeMasterPassword,
  getAccount,
  memberKeySuiteOf,
} from '../../../shared/api/account-api'
import { useAuthStore } from '../stores/auth-store'

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

export function useChangeMasterPassword() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangeMasterPasswordInput) => {
      const account = await getAccount()
      if (!account.kdf || !account.encryptedPrivateKey) {
        throw new Error('Account is missing versioned key material')
      }
      const version = identityProfileVersion(account.kdf)
      if (account.kdf.minimumSecurityVersion > CURRENT_IDENTITY_PROFILE.securityVersion) throw new Error('upgrade-required')

      let accountSecret: Uint8Array | null = null
      let current: IdentityKdfOutputs | null = null
      let newSalt: Uint8Array | null = null
      let next: IdentityKdfOutputs | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      let newEncryptedPrivateKey: Uint8Array | null = null
      try {
        // The Secret Key stays the same; only the password and KDF salt change.
        if (version === 2) {
          accountSecret = await loadDeviceSecretKey(account.userId)
          if (!accountSecret) throw new SecretKeyRequiredError(account.userId)
        }
        current = await deriveAccountIdentity({
          password: currentPassword, accountId: account.userId, kdf: account.kdf, accountSecret,
        })
        newSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        next = await deriveAccountIdentity({
          password: newPassword,
          accountId: account.userId,
          kdf: { ...account.kdf, kdfSalt: encodeBase64Url(newSalt) },
          accountSecret,
        })
        try {
          encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
          privateKey = await decryptWithKey(encryptedPrivateKey, current.masterKey)
        } catch {
          throw new IncorrectCurrentPasswordError()
        }

        newEncryptedPrivateKey = await encryptWithKey(privateKey, next.masterKey)
        await changeMasterPassword({
          securityVersion: account.kdf.securityVersion,
          kdfProfileId: account.kdf.profileId,
          baseCredentialRevision: account.kdf.credentialRevision,
          basePrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
          currentAuthCredential: encodeBase64Url(current.authCredential),
          newAuthCredential: encodeBase64Url(next.authCredential),
          newKdfSalt: encodeBase64Url(newSalt),
          newEncryptedPrivateKey: encodeBase64Url(newEncryptedPrivateKey),
        })

        useAuthStore.getState().unlockVault(next.masterKey, privateKey, undefined, memberKeySuiteOf(account))
      } finally {
        if (accountSecret) wipe(accountSecret)
        if (newSalt) wipe(newSalt)
        if (current) {
          wipe(current.authCredential)
          wipe(current.masterKey)
        }
        if (next) {
          wipe(next.authCredential)
          wipe(next.masterKey)
        }
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
        if (newEncryptedPrivateKey) wipe(newEncryptedPrivateKey)
        if (privateKey) wipe(privateKey)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
