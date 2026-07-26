import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deriveKey } from '../../../shared/crypto/argon2'
import {
  deriveIdentityV2,
  generateIdentityAccountId,
  IDENTITY_KDF_PROFILE_ID,
  IDENTITY_KDF_SALT_BYTES,
  LEGACY_IDENTITY_KDF_PROFILE_ID,
} from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { encryptWithKey, randomBytes, wipe } from '../../../shared/crypto/sodium'
import {
  ACCOUNT_QUERY_KEY,
  getAccount,
  migrateIdentityKdf,
} from '../../../shared/api/account-api'
import { fetchLoginKdf } from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

interface PendingMigration {
  migrationId: string
  sourceSecurityVersion: number
  baseCredentialRevision: number
  basePrivateKeyWrapRevision: number
  currentAuthCredential: Uint8Array
  newAuthCredential: Uint8Array
  newKdfSalt: Uint8Array
  newEncryptedPrivateKey: Uint8Array
  newMasterKey: Uint8Array
  privateKey: Uint8Array
  accountSecret: Uint8Array
}

function wipePending(pending: PendingMigration | null): void {
  if (!pending) return
  wipe(pending.currentAuthCredential)
  wipe(pending.newAuthCredential)
  wipe(pending.newKdfSalt)
  wipe(pending.newEncryptedPrivateKey)
  wipe(pending.newMasterKey)
  wipe(pending.privateKey)
  wipe(pending.accountSecret)
}

export function useIdentityKdfMigration() {
  const queryClient = useQueryClient()
  const pending = useRef<PendingMigration | null>(null)

  useEffect(() => () => {
    wipePending(pending.current)
    pending.current = null
  }, [])

  return useMutation({
    mutationFn: async ({
      password,
      accountSecret,
    }: {
      password: string
      accountSecret: Uint8Array
    }) => {
      if (!pending.current) {
        const account = await getAccount()
        const privateKey = useAuthStore.getState().privateKey
        if (!account.kdf
          || account.kdf.securityVersion !== 1
          || account.kdf.profileId !== LEGACY_IDENTITY_KDF_PROFILE_ID
          || !privateKey) {
          throw new Error('Legacy KDF migration is not applicable')
        }

        let legacySalt: Uint8Array | null = null
        let currentAuthCredential: Uint8Array | null = null
        let newKdfSalt: Uint8Array | null = null
        let identity: Awaited<ReturnType<typeof deriveIdentityV2>> | null = null
        let newEncryptedPrivateKey: Uint8Array | null = null
        let privateKeyCopy: Uint8Array | null = null
        let accountSecretCopy: Uint8Array | null = null
        let ownershipTransferred = false
        try {
          const bootstrap = await fetchLoginKdf(account.email, LEGACY_IDENTITY_KDF_PROFILE_ID)
          legacySalt = decodeBase64Url(bootstrap.kdfSalt, 16)
          currentAuthCredential = await deriveKey(password, legacySalt)
          newKdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
          identity = await deriveIdentityV2(
            password,
            accountSecret,
            account.userId,
            newKdfSalt,
          )
          newEncryptedPrivateKey = await encryptWithKey(privateKey, identity.masterKey)
          privateKeyCopy = new Uint8Array(privateKey)
          accountSecretCopy = new Uint8Array(accountSecret)

          pending.current = {
            migrationId: generateIdentityAccountId(),
            sourceSecurityVersion: account.kdf.securityVersion,
            baseCredentialRevision: account.kdf.credentialRevision,
            basePrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
            currentAuthCredential,
            newAuthCredential: identity.authCredential,
            newKdfSalt,
            newEncryptedPrivateKey,
            newMasterKey: identity.masterKey,
            privateKey: privateKeyCopy,
            accountSecret: accountSecretCopy,
          }
          ownershipTransferred = true
        } finally {
          if (legacySalt) wipe(legacySalt)
          if (!ownershipTransferred) {
            if (currentAuthCredential) wipe(currentAuthCredential)
            if (newKdfSalt) wipe(newKdfSalt)
            if (identity) {
              wipe(identity.authCredential)
              wipe(identity.masterKey)
            }
            if (newEncryptedPrivateKey) wipe(newEncryptedPrivateKey)
            if (privateKeyCopy) wipe(privateKeyCopy)
            if (accountSecretCopy) wipe(accountSecretCopy)
          }
        }
      }

      const operation = pending.current
      await migrateIdentityKdf({
        migrationId: operation.migrationId,
        sourceSecurityVersion: operation.sourceSecurityVersion,
        baseCredentialRevision: operation.baseCredentialRevision,
        basePrivateKeyWrapRevision: operation.basePrivateKeyWrapRevision,
        targetProfileId: IDENTITY_KDF_PROFILE_ID,
        currentAuthCredential: encodeBase64Url(operation.currentAuthCredential),
        newAuthCredential: encodeBase64Url(operation.newAuthCredential),
        newKdfSalt: encodeBase64Url(operation.newKdfSalt),
        newEncryptedPrivateKey: encodeBase64Url(operation.newEncryptedPrivateKey),
      })

      useAuthStore.getState().unlockVault(
        operation.newMasterKey,
        operation.privateKey,
        operation.accountSecret,
      )
      await queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
      wipePending(operation)
      pending.current = null
    },
  })
}
