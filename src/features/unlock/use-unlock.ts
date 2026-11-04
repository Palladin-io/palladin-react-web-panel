import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { beginManualUnlockAttempt, prepareManualSharedUnlock, useAuthStore } from '../auth'
import {
  beginSecurityUpgrade,
  cancelSecurityUpgrade,
  createSecurityUpgradeDraft,
  discardSecurityUpgradeDraft,
  needsSecurityUpgrade,
  resumeSecurityUpgradeIfNeeded,
  type SecurityUpgradeDraft,
} from '../security-upgrade'
import {
  deriveAccountIdentity,
  identityProfileVersion,
  SecretKeyRequiredError,
  type IdentityKdfOutputs,
} from '../../shared/crypto/identity-kdf'
import { loadDeviceSecretKey } from '../../shared/crypto/secret-key'
import { decodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { decryptWithKey, wipe } from '../../shared/crypto/sodium'
import { getAccount, memberKeySuiteOf } from '../../shared/api/account-api'

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
  const activeAttempt = useRef<ReturnType<typeof beginManualUnlockAttempt> | null>(null)
  useEffect(() => () => activeAttempt.current?.cancel(), [])
  return useMutation({
    mutationFn: async ({ password }: UnlockInput) => {
      const attempt = beginManualUnlockAttempt()
      activeAttempt.current = attempt
      const account = await getAccount()
      attempt.assertCurrent()
      if (!account.kdf || !account.encryptedPrivateKey) {
        throw new Error('Account setup incomplete')
      }
      const version = identityProfileVersion(account.kdf)

      let accountSecret: Uint8Array | null = null
      let identity: IdentityKdfOutputs | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKey: Uint8Array | null = null
      let draft: SecurityUpgradeDraft | null = null
      let installed = false
      try {
        if (version === 2) {
          accountSecret = await loadDeviceSecretKey(account.userId)
          if (!accountSecret) throw new SecretKeyRequiredError(account.userId)
        }
        identity = await deriveAccountIdentity({ password, accountId: account.userId, kdf: account.kdf, accountSecret })
        attempt.assertCurrent()

        encryptedPrivateKey = decodeBase64Url(account.encryptedPrivateKey, 4096)
        try {
          privateKey = await decryptWithKey(encryptedPrivateKey, identity.masterKey)
        } catch {
          throw new IncorrectMasterPasswordError()
        }
        attempt.assertCurrent()

        if (needsSecurityUpgrade(version)) {
          draft = await createSecurityUpgradeDraft(account.userId, password)
          attempt.assertCurrent()
          const owned = draft
          draft = null
          await beginSecurityUpgrade({
            account, draft: owned, currentAuthCredential: identity.authCredential, legacyPrivateKey: privateKey,
          })
        } else {
          await resumeSecurityUpgradeIfNeeded(account, identity.masterKey)
        }
        attempt.assertCurrent()
        useAuthStore.getState().unlockVault(identity.masterKey, privateKey, undefined, memberKeySuiteOf(account))
        installed = true
        await prepareManualSharedUnlock(account, identity.authCredential)
      } finally {
        if (!installed) cancelSecurityUpgrade()
        discardSecurityUpgradeDraft(draft)
        if (accountSecret) wipe(accountSecret)
        if (identity) { wipe(identity.masterKey); wipe(identity.authCredential) }
        if (privateKey) wipe(privateKey)
        if (encryptedPrivateKey) wipe(encryptedPrivateKey)
      }
    },
  })
}
