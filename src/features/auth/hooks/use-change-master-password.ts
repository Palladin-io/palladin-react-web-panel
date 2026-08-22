import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../session/use-authenticated-mutation'
import {
  assertIdentityKdfProfile,
  deriveIdentityV1,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_KDF_SALT_BYTES,
} from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, encryptWithKey, randomBytes, wipe } from '../../../shared/crypto/sodium'
import {
  ACCOUNT_QUERY_KEY,
  changeMasterPassword,
  getAccountForSession,
} from '../../../shared/api/account-api'
import { authenticatedQueryKey } from '../session/authenticated-query-key'
import {
  StaleAuthenticatedSessionError,
  unlockVaultForSession,
} from '../session/session-boundary'

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
    mutationFn: async (
      { currentPassword, newPassword }: ChangeMasterPasswordInput,
      context,
    ) => {
      const account = await getAccountForSession(context.sessionSnapshot)
      if (!account.kdf || !account.encryptedPrivateKey) {
        throw new Error('Account is missing versioned key material')
      }
      assertIdentityKdfProfile({
        ...account.kdf,
        memoryKiB: IDENTITY_KDF_PROFILE.memoryKiB,
        iterations: IDENTITY_KDF_PROFILE.iterations,
        parallelism: IDENTITY_KDF_PROFILE.parallelism,
      })
      if (account.kdf.minimumSecurityVersion > IDENTITY_KDF_PROFILE.securityVersion) {
        throw new Error('upgrade-required')
      }

      let currentSalt: Uint8Array | null = null
      let current: Awaited<ReturnType<typeof deriveIdentityV1>> | null = null
      let newSalt: Uint8Array | null = null
      let next: Awaited<ReturnType<typeof deriveIdentityV1>> | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      let newEncryptedPrivateKey: Uint8Array | null = null
      try {
        currentSalt = decodeBase64Url(account.kdf.kdfSalt, IDENTITY_KDF_SALT_BYTES)
        current = await deriveIdentityV1(
          currentPassword,
          account.userId,
          currentSalt,
        )
        newSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        next = await deriveIdentityV1(
          newPassword,
          account.userId,
          newSalt,
        )
        try {
          encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
          privateKey = await decryptWithKey(encryptedPrivateKey, current.masterKey)
        } catch {
          throw new IncorrectCurrentPasswordError()
        }

        newEncryptedPrivateKey = await encryptWithKey(privateKey, next.masterKey)
        context.assertSessionCurrent()
        await changeMasterPassword({
          securityVersion: IDENTITY_KDF_PROFILE.securityVersion,
          kdfProfileId: IDENTITY_KDF_PROFILE_ID,
          baseCredentialRevision: account.kdf.credentialRevision,
          basePrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
          currentAuthCredential: encodeBase64Url(current.authCredential),
          newAuthCredential: encodeBase64Url(next.authCredential),
          newKdfSalt: encodeBase64Url(newSalt),
          newEncryptedPrivateKey: encodeBase64Url(newEncryptedPrivateKey),
        }, context.sessionSnapshot)

        if (!unlockVaultForSession(
          context.sessionSnapshot,
          next.masterKey,
          privateKey,
        )) {
          throw new StaleAuthenticatedSessionError()
        }
      } finally {
        if (currentSalt) wipe(currentSalt)
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
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(ACCOUNT_QUERY_KEY) })
    },
  })
}
