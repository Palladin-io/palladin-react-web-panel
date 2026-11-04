import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from '../../shared/crypto/argon2'
import {
  deriveIdentityV1,
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
import { createAccountRecoveryProof } from '../../shared/crypto/account-recovery-proof'
import {
  ACCOUNT_QUERY_KEY,
  getAccount,
  issueRecoveryChallenge,
  memberKeySuiteOf,
  recoverAccount,
  type AccountResponse,
  type RecoverAccountPayload,
} from '../../shared/api/account-api'
import { KEY_WRAPPER_SUITE } from '../../shared/crypto/key-wrapper'
import {
  createAccountSecurityMaterial,
  wipeAccountSecurityMaterial,
  type AccountSecurityMaterial,
} from '../../shared/crypto/account-security'
import { emergencyKitMaterial, storeDeviceSecretKey, type EmergencyKitMaterial } from '../../shared/crypto/secret-key'
import { hasApiErrorKey } from '../../shared/api/error-response'
import { generateRecoveryMnemonic, joinMnemonic } from '../../shared/lib/mnemonic'
import { useAuthStore } from '../auth'

export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super('Invalid recovery key')
    this.name = 'InvalidRecoveryKeyError'
  }
}

export class RecoveryProofInvalidError extends Error {
  constructor() {
    super('Recovery proof rejected')
    this.name = 'RecoveryProofInvalidError'
  }
}

export interface RecoverInput {
  recoveryMnemonic: string[]
  newPassword: string
}

export interface RecoverResult {
  recoveryMnemonic: string[]
  /** Present when recovery issued a new Secret Key (X-Wing Member key accounts). */
  kit: EmergencyKitMaterial | null
}

async function submitRecovery(payload: RecoverAccountPayload): Promise<void> {
  try {
    await recoverAccount(payload)
  } catch (error) {
    if (await hasApiErrorKey(error, 'errors.backend.recovery-proof-invalid')) {
      throw new RecoveryProofInvalidError()
    }
    throw error
  }
}

/**
 * identity-kdf v3 `recovery`: the Member key stays, everything derived from the
 * password changes — a new Secret Key, KDF salt and recovery phrase. The new
 * Secret Key replaces this browser's wrapped copy once Identity has accepted it.
 */
async function recoverWithNewSecretKey(
  account: AccountResponse,
  sessionUserId: string,
  privateKey: Uint8Array,
  newPassword: string,
  newRecoveryMnemonic: string[],
): Promise<EmergencyKitMaterial> {
  if (!account.kdf) throw new Error('Account is missing recovery material')
  let material: AccountSecurityMaterial | null = null
  try {
    material = await createAccountSecurityMaterial({
      accountId: account.userId,
      password: newPassword,
      recoveryPhrase: joinMnemonic(newRecoveryMnemonic),
      memberPrivateKey: privateKey,
    })
    const challenge = await issueRecoveryChallenge()
    if (challenge.version !== undefined && challenge.version !== 2) throw new RecoveryProofInvalidError()
    const recoveryProof = await createAccountRecoveryProof(
      challenge.sealedChallenge, sessionUserId, { keySuiteId: memberKeySuiteOf(account), privateKey },
    )
    await submitRecovery({
      securityVersion: material.securityVersion,
      kdfProfileId: material.kdfProfileId,
      baseCredentialRevision: account.kdf.credentialRevision,
      basePrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
      newKdfSalt: material.kdfSalt,
      newEncryptedPrivateKey: material.encryptedPrivateKey,
      newRecoverySalt: material.recoverySalt,
      newEncryptedPrivateKeyByRecovery: material.encryptedPrivateKeyByRecovery,
      newAuthCredential: encodeBase64Url(material.authCredential),
      recoveryProof,
    })
    // Replaces (and so deletes) the old Secret Key's device wrapper.
    await storeDeviceSecretKey(account.userId, material.secretKey)
    return emergencyKitMaterial(account.userId, account.email, material.secretKey)
  } finally {
    wipeAccountSecurityMaterial(material)
  }
}

export function useRecover() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ recoveryMnemonic, newPassword }: RecoverInput): Promise<RecoverResult> => {
      const sessionUserId = useAuthStore.getState().userId
      if (!sessionUserId) throw new Error('Recovery requires an authenticated session')
      const account = await getAccount()
      if (!account.recoverySalt || !account.encryptedPrivateKeyByRecovery || !account.kdf) {
        throw new Error('Account is missing recovery material')
      }

      const newRecoveryMnemonic = generateRecoveryMnemonic()
      let recoverySalt: Uint8Array | null = null
      let recoveryKey: Uint8Array | null = null
      let newKdfSalt: Uint8Array | null = null
      let newRecoverySalt: Uint8Array | null = null
      let privateKey: Uint8Array | null = null
      let encryptedPrivateKeyByRecovery: Uint8Array | null = null
      let newRecoveryKey: Uint8Array | null = null
      let identity: Awaited<ReturnType<typeof deriveIdentityV1>> | null = null
      try {
        recoverySalt = decodeBase64Url(account.recoverySalt, 64)
        recoveryKey = await deriveKey(joinMnemonic(recoveryMnemonic), recoverySalt)
        newKdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
        newRecoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
        try {
          encryptedPrivateKeyByRecovery = decodeBase64Url(
            account.encryptedPrivateKeyByRecovery,
            4096,
          )
          privateKey = await decryptWithKey(encryptedPrivateKeyByRecovery, recoveryKey)
        } catch {
          throw new InvalidRecoveryKeyError()
        }

        const memberKey = { keySuiteId: memberKeySuiteOf(account), privateKey }
        if (memberKey.keySuiteId !== KEY_WRAPPER_SUITE.legacy) {
          const kit = await recoverWithNewSecretKey(account, sessionUserId, memberKey.privateKey, newPassword, newRecoveryMnemonic)
          return { recoveryMnemonic: newRecoveryMnemonic, kit }
        }

        identity = await deriveIdentityV1(
          newPassword,
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

        const challenge = await issueRecoveryChallenge()
        const recoveryProof = await createAccountRecoveryProof(challenge.sealedChallenge, sessionUserId, memberKey)

        await submitRecovery({
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
          recoveryProof,
        })

        return { recoveryMnemonic: newRecoveryMnemonic, kit: null }
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
    },
  })
}
