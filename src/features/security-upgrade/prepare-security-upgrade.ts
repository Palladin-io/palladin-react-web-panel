import type { AccountResponse } from '../../shared/api/account-api'
import {
  createSecurityUpgradeMaterial,
  wipeSecurityUpgradeMaterial,
  wrapLegacyMemberKey,
  type SecurityUpgradeMaterial,
} from '../../shared/crypto/account-security'
import { CURRENT_IDENTITY_PROFILE } from '../../shared/crypto/identity-kdf'
import { randomUuid } from '../../shared/crypto/random-uuid'
import { decryptWithKey, wipe } from '../../shared/crypto/sodium'
import { decodeBase64Url, encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { generateRecoveryMnemonic, joinMnemonic } from '../../shared/lib/mnemonic'
import { useSecurityUpgradeStore } from './security-upgrade-store'

/** Password-dependent half of the upgrade, derived while the password is still in hand. */
export interface SecurityUpgradeDraft {
  recoveryMnemonic: string[]
  material: SecurityUpgradeMaterial
}

export function needsSecurityUpgrade(securityVersion: number): boolean {
  return securityVersion < CURRENT_IDENTITY_PROFILE.securityVersion
}

export async function createSecurityUpgradeDraft(accountId: string, password: string): Promise<SecurityUpgradeDraft> {
  const recoveryMnemonic = generateRecoveryMnemonic()
  const material = await createSecurityUpgradeMaterial({
    accountId,
    password,
    recoveryPhrase: joinMnemonic(recoveryMnemonic),
  })
  return { recoveryMnemonic, material }
}

export function discardSecurityUpgradeDraft(draft: SecurityUpgradeDraft | null | undefined): void {
  if (draft) wipeSecurityUpgradeMaterial(draft.material)
}

/**
 * Hands the draft to the upgrade gate. Takes ownership of `draft`; copies the
 * legacy private key so the caller keeps wiping its own buffer.
 */
export async function beginSecurityUpgrade(input: {
  account: AccountResponse
  draft: SecurityUpgradeDraft
  currentAuthCredential: Uint8Array
  legacyPrivateKey: Uint8Array
}): Promise<void> {
  const { account, draft } = input
  try {
    if (!account.kdf || !account.memberKeyVersion) throw new Error('Account is missing versioned key material')
    const { material } = draft
    const legacyEncryptedPrivateKey = await wrapLegacyMemberKey(input.legacyPrivateKey, material.masterKey)
    useSecurityUpgradeStore.getState().begin({
      kind: 'upgrade',
      accountId: account.userId,
      email: account.email,
      recoveryMnemonic: draft.recoveryMnemonic,
      material,
      legacyPrivateKey: new Uint8Array(input.legacyPrivateKey),
      legacyMemberKeyVersion: account.memberKeyVersion,
      request: {
        migrationId: randomUuid(),
        sourceSecurityVersion: account.kdf.securityVersion,
        baseCredentialRevision: account.kdf.credentialRevision,
        basePrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
        baseMemberKeyVersion: account.memberKeyVersion,
        // An OAuth account without a password credential has nothing to prove (base revision 0).
        currentAuthCredential: account.kdf.credentialRevision === 0 ? '' : encodeBase64Url(input.currentAuthCredential),
        securityVersion: material.securityVersion,
        kdfProfileId: material.kdfProfileId,
        kdfSalt: material.kdfSalt,
        newAuthCredential: encodeBase64Url(material.authCredential),
        memberPublicKeySuiteId: material.memberKey.keySuiteId,
        memberPublicKey: encodeBase64Url(material.memberKey.publicKey),
        encryptedPrivateKey: material.encryptedPrivateKey,
        recoverySalt: material.recoverySalt,
        encryptedPrivateKeyByRecovery: material.encryptedPrivateKeyByRecovery,
        legacyEncryptedPrivateKey,
      },
    })
  } catch (error) {
    discardSecurityUpgradeDraft(draft)
    throw error
  }
}

/** A v2 unlock that still holds the legacy-key record resumes the Vault re-wrap. */
export async function resumeSecurityUpgradeIfNeeded(account: AccountResponse, masterKey: Uint8Array): Promise<void> {
  const legacy = account.legacyMemberKey
  if (!legacy) return
  const ciphertext = decodeBase64Url(legacy.encryptedPrivateKey, 4096)
  try {
    const legacyPrivateKey = await decryptWithKey(ciphertext, masterKey)
    useSecurityUpgradeStore.getState().begin({
      kind: 'resume',
      legacyPrivateKey,
      legacyMemberKeyVersion: legacy.memberKeyVersion,
    })
  } finally {
    wipe(ciphertext)
  }
}
