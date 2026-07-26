import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../shared/crypto/argon2'
import {
  deriveIdentityV2,
  generateAccountSecret,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_KDF_SALT_BYTES,
} from '../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
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

export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super('Invalid recovery key')
    this.name = 'InvalidRecoveryKeyError'
  }
}

export interface RecoverInput {
  recoveryMnemonic: string[]
  newPassword: string
}

export interface RecoverResult {
  recoveryMnemonic: string[]
  accountSecret: Uint8Array
}

export function useRecover() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recoveryMnemonic, newPassword }: RecoverInput): Promise<RecoverResult> => {
      const account = await getAccount()
      if (!account.recoverySalt || !account.encryptedPrivateKeyByRecovery || !account.kdf) {
        throw new Error('Account is missing recovery material')
      }

      const newRecoveryMnemonic = generateRecoveryMnemonic()
      let recoverySalt: Uint8Array | null = null
      let recoveryKey: Uint8Array | null = null
      let newKdfSalt: Uint8Array | null = null
      let newRecoverySalt: Uint8Array | null = null
      let accountSecret: Uint8Array | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKeyByRecovery: Uint8Array | null = null
      let newRecoveryKey: Uint8Array | null = null
      let identity: Awaited<ReturnType<typeof deriveIdentityV2>> | null = null
      let succeeded = false
      try {
        recoverySalt = decodeBase64Url(account.recoverySalt, 64)
        recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)
        newKdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        newRecoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
        accountSecret = await generateAccountSecret()
        try {
          encryptedPrivateKeyByRecovery = decodeBase64Url(
            account.encryptedPrivateKeyByRecovery,
            4096,
          )
          privateKey = await decryptWithKey(encryptedPrivateKeyByRecovery, recoveryKey)
        } catch {
          throw new InvalidRecoveryKeyError()
        }

        identity = await deriveIdentityV2(
          newPassword,
          accountSecret,
          account.userId,
          newKdfSalt,
        )
        const newEncryptedPrivateKey = await encryptWithKey(privateKey, identity.masterKey)
        newRecoveryKey = await deriveKey(
          joinMnemonic(newRecoveryMnemonic),
          newRecoverySalt,
        )
        const newEncryptedPrivateKeyByRecovery = await encryptWithKey(
          privateKey,
          newRecoveryKey,
        )

        await recoverAccount({
          securityVersion: IDENTITY_KDF_PROFILE.securityVersion,
          kdfProfileId: IDENTITY_KDF_PROFILE_ID,
          baseCredentialRevision: account.kdf.credentialRevision,
          basePrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
          newKdfSalt: encodeBase64Url(newKdfSalt),
          newEncryptedPrivateKey: encodeBase64Url(newEncryptedPrivateKey),
          newRecoverySalt: encodeBase64Url(newRecoverySalt),
          newEncryptedPrivateKeyByRecovery: encodeBase64Url(newEncryptedPrivateKeyByRecovery),
          ...(account.kdf.credentialRevision > 0
            ? { newAuthCredential: encodeBase64Url(identity.authCredential) }
            : {}),
        })

        succeeded = true
        return { recoveryMnemonic: newRecoveryMnemonic, accountSecret }
      } finally {
        if (recoverySalt) wipe(recoverySalt)
        if (recoveryKey) wipe(recoveryKey)
        if (newKdfSalt) wipe(newKdfSalt)
        if (newRecoverySalt) wipe(newRecoverySalt)
        if (encryptedPrivateKeyByRecovery) wipe(encryptedPrivateKeyByRecovery)
        if (privateKey) wipe(privateKey)
        if (newRecoveryKey) wipe(newRecoveryKey)
        if (identity) {
          wipe(identity.authCredential)
          wipe(identity.masterKey)
        }
        if (!succeeded && accountSecret) wipe(accountSecret)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
