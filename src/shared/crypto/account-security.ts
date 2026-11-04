import { deriveIdentityV2, generateRecipientKeyPair, type RecipientKeyPair } from '@palladin/crypto'
import { deriveKey, RECOVERY_KEY_SALT_BYTES } from './argon2'
import { CURRENT_IDENTITY_PROFILE, IDENTITY_KDF_SALT_BYTES } from './identity-kdf'
import { generateSecretKey } from './secret-key'
import { encryptWithKey, randomBytes, wipe } from './sodium'
import { encodeBase64Url } from './vault-v2-bytes'

/**
 * Identity v2 material for a new password: a fresh Secret Key and salts, the
 * v2 MK/AuthCredential and both wraps of the Member private key. Secrets stay
 * in memory; the caller owns `secretKey`, `masterKey` and `authCredential` and
 * must call `wipeAccountSecurityMaterial`.
 */
export interface AccountSecurityMaterial {
  secretKey: Uint8Array
  masterKey: Uint8Array
  authCredential: Uint8Array
  securityVersion: number
  kdfProfileId: string
  kdfSalt: string
  recoverySalt: string
  encryptedPrivateKey: string
  encryptedPrivateKeyByRecovery: string
}

export async function createAccountSecurityMaterial(input: {
  accountId: string
  password: string
  recoveryPhrase: string
  memberPrivateKey: Uint8Array
}): Promise<AccountSecurityMaterial> {
  const secretKey = await generateSecretKey()
  const kdfSalt = await randomBytes(IDENTITY_KDF_SALT_BYTES)
  const recoverySalt = await randomBytes(RECOVERY_KEY_SALT_BYTES)
  let recoveryKey: Uint8Array | undefined
  let identity: Awaited<ReturnType<typeof deriveIdentityV2>> | undefined
  let wrapped: Uint8Array | undefined
  let wrappedByRecovery: Uint8Array | undefined
  let completed = false
  try {
    identity = await deriveIdentityV2(input.password, secretKey, input.accountId, kdfSalt)
    recoveryKey = await deriveKey(input.recoveryPhrase, recoverySalt)
    wrapped = await encryptWithKey(input.memberPrivateKey, identity.masterKey)
    wrappedByRecovery = await encryptWithKey(input.memberPrivateKey, recoveryKey)
    const material = {
      secretKey,
      masterKey: identity.masterKey,
      authCredential: identity.authCredential,
      securityVersion: CURRENT_IDENTITY_PROFILE.securityVersion,
      kdfProfileId: CURRENT_IDENTITY_PROFILE.id,
      kdfSalt: encodeBase64Url(kdfSalt),
      recoverySalt: encodeBase64Url(recoverySalt),
      encryptedPrivateKey: encodeBase64Url(wrapped),
      encryptedPrivateKeyByRecovery: encodeBase64Url(wrappedByRecovery),
    }
    completed = true
    return material
  } finally {
    wipe(kdfSalt)
    wipe(recoverySalt)
    if (recoveryKey) wipe(recoveryKey)
    if (wrapped) wipe(wrapped)
    if (wrappedByRecovery) wipe(wrappedByRecovery)
    if (!completed) {
      wipe(secretKey)
      if (identity) { wipe(identity.masterKey); wipe(identity.authCredential) }
    }
  }
}

export function wipeAccountSecurityMaterial(material: AccountSecurityMaterial | null | undefined): void {
  if (!material) return
  wipe(material.secretKey)
  wipe(material.masterKey)
  wipe(material.authCredential)
}

/** New Member encryption key pair in the active key-wrapper suite. */
export function generateMemberKeyPair(): Promise<RecipientKeyPair> {
  return generateRecipientKeyPair()
}

/**
 * identity-kdf v3 `migration` client material: everything password-dependent
 * for the v1 → v2 upgrade. The new Member key is independent of the old one;
 * the old private key is wrapped under the new MK separately (`wrapLegacyMemberKey`)
 * once the v1 unlock has recovered it.
 */
export interface SecurityUpgradeMaterial extends AccountSecurityMaterial {
  memberKey: RecipientKeyPair
}

export async function createSecurityUpgradeMaterial(input: {
  accountId: string
  password: string
  recoveryPhrase: string
}): Promise<SecurityUpgradeMaterial> {
  const memberKey = await generateMemberKeyPair()
  try {
    const material = await createAccountSecurityMaterial({ ...input, memberPrivateKey: memberKey.privateKey })
    return { ...material, memberKey }
  } catch (error) {
    wipe(memberKey.privateKey)
    throw error
  }
}

export function wipeSecurityUpgradeMaterial(material: SecurityUpgradeMaterial | null | undefined): void {
  if (!material) return
  wipeAccountSecurityMaterial(material)
  wipe(material.memberKey.privateKey)
}

/** The legacy-key record kept under the v2 MK until no envelope addresses the old key. */
export async function wrapLegacyMemberKey(legacyPrivateKey: Uint8Array, masterKey: Uint8Array): Promise<string> {
  const wrapped = await encryptWithKey(legacyPrivateKey, masterKey)
  try {
    return encodeBase64Url(wrapped)
  } finally {
    wipe(wrapped)
  }
}
