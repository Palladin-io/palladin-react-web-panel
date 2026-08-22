import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../../auth'
import {
  authenticatedQueryKey,
  markOnboardedForSession,
  StaleAuthenticatedSessionError,
  unlockVaultForSession,
  useAuthStore,
} from '../../auth'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../../shared/crypto/argon2'
import {
  deriveIdentityV1,
  IDENTITY_KDF_PROFILE,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_KDF_SALT_BYTES,
} from '../../../shared/crypto/identity-kdf'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import {
  encryptWithKey,
  generateKeyPair,
  randomBytes,
  wipe,
} from '../../../shared/crypto/sodium'
import {
  ACCOUNT_QUERY_KEY,
  getAccountForSession,
  setupAccount,
} from '../../../shared/api/account-api'
import i18n from '../../../shared/lib/i18n'
import { joinMnemonic } from '../../../shared/lib/mnemonic'
import { createDefaultVaultSafe } from '../../../shared/lib/create-default-vault-safe'

export interface CompleteSetupInput {
  masterPassword: string
  recoveryMnemonic: string[]
}

export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      masterPassword,
      recoveryMnemonic,
    }: CompleteSetupInput, context) => {
      const account = await getAccountForSession(context.sessionSnapshot)
      let kdfSalt: Uint8Array | null = null
      let identity: Awaited<ReturnType<typeof deriveIdentityV1>> | null = null
      let keyPair: Awaited<ReturnType<typeof generateKeyPair>> | null = null
      let recoverySalt: Uint8Array | null = null
      let recoveryKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      let encryptedPrivateKeyByRecovery: Uint8Array | null = null

      try {
        kdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        identity = await deriveIdentityV1(
          masterPassword,
          account.userId,
          kdfSalt,
        )
        keyPair = await generateKeyPair()
        recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
        recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)
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
          newAuthCredential: encodeBase64Url(identity.authCredential),
        }, context.sessionSnapshot)

        if (!unlockVaultForSession(
          context.sessionSnapshot,
          identity.masterKey,
          keyPair.privateKey,
        )) {
          throw new StaleAuthenticatedSessionError()
        }
      } finally {
        if (kdfSalt) wipe(kdfSalt)
        if (recoverySalt) wipe(recoverySalt)
        if (identity) {
          wipe(identity.masterKey)
          wipe(identity.authCredential)
        }
        if (recoveryKey) wipe(recoveryKey)
        if (keyPair) wipe(keyPair.privateKey)
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
        if (encryptedPrivateKeyByRecovery) wipe(encryptedPrivateKeyByRecovery)
      }

      const privateKey = useAuthStore.getState().privateKey
      if (privateKey) {
        await createDefaultVaultSafe(
          privateKey,
          i18n.t('vault.defaultName'),
          context.sessionSnapshot,
        )
      }
    },
    onSuccess: (_data, _variables, _result, context) => {
      if (!markOnboardedForSession(context.sessionSnapshot)) return
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(ACCOUNT_QUERY_KEY) })
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(['vaults']) })
    },
  })
}
