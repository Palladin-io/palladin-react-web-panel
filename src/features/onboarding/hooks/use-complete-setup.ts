import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../../shared/crypto/argon2'
import {
  deriveIdentityV2,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_KDF_SALT_BYTES,
  LEGACY_IDENTITY_KDF_PROFILE_ID,
} from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import {
  encryptWithKey,
  generateKeyPair,
  randomBytes,
  wipe,
} from '../../../shared/crypto/sodium'
import { ACCOUNT_QUERY_KEY, getAccount, setupAccount } from '../../../shared/api/account-api'
import { fetchLoginKdf } from '../../auth/api/auth-api'
import i18n from '../../../shared/lib/i18n'
import { joinMnemonic } from '../../../shared/lib/mnemonic'
import { createDefaultVaultSafe } from '../../../shared/lib/create-default-vault-safe'

export interface CompleteSetupInput {
  masterPassword: string
  recoveryMnemonic: string[]
  accountSecret: Uint8Array
}

export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      masterPassword,
      recoveryMnemonic,
      accountSecret,
    }: CompleteSetupInput) => {
      const account = await getAccount()
      let kdfSalt: Uint8Array | null = null
      let identity: Awaited<ReturnType<typeof deriveIdentityV2>> | null = null
      let keyPair: Awaited<ReturnType<typeof generateKeyPair>> | null = null
      let recoverySalt: Uint8Array | null = null
      let recoveryKey: Uint8Array | null = null
      let currentAuthCredential: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      let encryptedPrivateKeyByRecovery: Uint8Array | null = null

      try {
        kdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        identity = await deriveIdentityV2(
          masterPassword,
          accountSecret,
          account.userId,
          kdfSalt,
        )
        keyPair = await generateKeyPair()
        recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
        recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)
        if (account.kdf && account.kdf.credentialRevision > 0) {
          const legacy = await fetchLoginKdf(account.email, LEGACY_IDENTITY_KDF_PROFILE_ID)
          const legacySalt = decodeBase64Url(legacy.kdfSalt, 16)
          try {
            currentAuthCredential = await deriveKey(masterPassword, legacySalt)
          } finally {
            wipe(legacySalt)
          }
        }

        encryptedPrivateKey = await encryptWithKey(
          keyPair.privateKey,
          identity.masterKey,
        )
        encryptedPrivateKeyByRecovery = await encryptWithKey(
          keyPair.privateKey,
          recoveryKey,
        )

        await setupAccount({
          securityVersion: IDENTITY_KDF_PROFILE.securityVersion,
          kdfProfileId: IDENTITY_KDF_PROFILE_ID,
          kdfSalt: encodeBase64Url(kdfSalt),
          recoverySalt: encodeBase64Url(recoverySalt),
          publicKey: encodeBase64Url(keyPair.publicKey),
          encryptedPrivateKey: encodeBase64Url(encryptedPrivateKey),
          encryptedPrivateKeyByRecovery: encodeBase64Url(encryptedPrivateKeyByRecovery),
          ...(currentAuthCredential
            ? {
                currentAuthCredential: encodeBase64Url(currentAuthCredential),
                newAuthCredential: encodeBase64Url(identity.authCredential),
              }
            : {}),
        })

        useAuthStore.getState().unlockVault(
          identity.masterKey,
          keyPair.privateKey,
          accountSecret,
        )
      } finally {
        if (kdfSalt) wipe(kdfSalt)
        if (recoverySalt) wipe(recoverySalt)
        if (identity) {
          wipe(identity.masterKey)
          wipe(identity.authCredential)
        }
        if (recoveryKey) wipe(recoveryKey)
        if (keyPair) wipe(keyPair.privateKey)
        if (currentAuthCredential) wipe(currentAuthCredential)
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
        if (encryptedPrivateKeyByRecovery) wipe(encryptedPrivateKeyByRecovery)
      }

      const privateKey = useAuthStore.getState().privateKey
      if (privateKey) {
        await createDefaultVaultSafe(privateKey, i18n.t('vault.defaultName'))
      }
    },
    onSuccess: () => {
      useAuthStore.getState().markOnboarded()
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['vaults'] })
    },
  })
}
