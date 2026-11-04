import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../auth'
import {
  createAccountSecurityMaterial,
  generateMemberKeyPair,
  wipeAccountSecurityMaterial,
  type AccountSecurityMaterial,
} from '../../../shared/crypto/account-security'
import { emergencyKitMaterial, storeDeviceSecretKey, type EmergencyKitMaterial } from '../../../shared/crypto/secret-key'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { wipe } from '../../../shared/crypto/sodium'
import { ACCOUNT_QUERY_KEY, getAccount, setupAccount } from '../../../shared/api/account-api'
import i18n from '../../../shared/lib/i18n'
import { joinMnemonic } from '../../../shared/lib/mnemonic'
import { createDefaultVaultSafe } from '../../../shared/lib/create-default-vault-safe'

export interface CompleteSetupInput {
  masterPassword: string
  recoveryMnemonic: string[]
}

/** First key setup (OAuth accounts): Identity v2 with a new Secret Key and an X-Wing Member key. */
export function useCompleteSetup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      masterPassword,
      recoveryMnemonic,
    }: CompleteSetupInput): Promise<EmergencyKitMaterial> => {
      const account = await getAccount()
      let memberKey: Awaited<ReturnType<typeof generateMemberKeyPair>> | null = null
      let material: AccountSecurityMaterial | null = null
      let kit: EmergencyKitMaterial
      try {
        memberKey = await generateMemberKeyPair()
        material = await createAccountSecurityMaterial({
          accountId: account.userId,
          password: masterPassword,
          recoveryPhrase: joinMnemonic(recoveryMnemonic),
          memberPrivateKey: memberKey.privateKey,
        })
        await storeDeviceSecretKey(account.userId, material.secretKey)
        await setupAccount({
          securityVersion: material.securityVersion,
          kdfProfileId: material.kdfProfileId,
          kdfSalt: material.kdfSalt,
          recoverySalt: material.recoverySalt,
          publicKeySuiteId: memberKey.keySuiteId,
          publicKey: encodeBase64Url(memberKey.publicKey),
          encryptedPrivateKey: material.encryptedPrivateKey,
          encryptedPrivateKeyByRecovery: material.encryptedPrivateKeyByRecovery,
          newAuthCredential: encodeBase64Url(material.authCredential),
        })

        useAuthStore.getState().unlockVault(material.masterKey, memberKey.privateKey, undefined, memberKey.keySuiteId)
        kit = emergencyKitMaterial(account.userId, account.email, material.secretKey)
      } finally {
        wipeAccountSecurityMaterial(material)
        if (memberKey) wipe(memberKey.privateKey)
      }

      const privateKey = useAuthStore.getState().privateKey
      if (privateKey) {
        await createDefaultVaultSafe(privateKey, i18n.t('vault.defaultName'))
      }
      return kit
    },
    onSuccess: () => {
      useAuthStore.getState().markOnboarded()
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['vaults'] })
    },
  })
}
