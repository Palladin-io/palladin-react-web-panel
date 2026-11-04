import { api } from '../../shared/api/client'
import type { MemberVaultKeyEnvelopeContract } from '../../shared/crypto/key-wrapper'

/** identity-kdf v3 `migration.atomicServerWrite` + `compareAndSwap`; idempotent per `migrationId`. */
export interface SecurityUpgradeRequest {
  migrationId: string
  sourceSecurityVersion: number
  baseCredentialRevision: number
  basePrivateKeyWrapRevision: number
  baseMemberKeyVersion: number
  currentAuthCredential: string
  securityVersion: number
  kdfProfileId: string
  kdfSalt: string
  newAuthCredential: string
  memberPublicKeySuiteId: string
  memberPublicKey: string
  encryptedPrivateKey: string
  recoverySalt: string
  encryptedPrivateKeyByRecovery: string
  legacyEncryptedPrivateKey: string
}

export interface KeyMigrationReport {
  currentSuiteId: string
  memberKey: { keyVersion: number; suiteId: string } | null
  memberEnvelopes: number
  memberEnvelopesPendingRewrap: number
  agentEnvelopesOnNonCurrentSuite: number
}

export function submitSecurityUpgrade(request: SecurityUpgradeRequest): Promise<void> {
  return api.post('api/account/security-upgrade', { json: request, retry: 0 }).json<void>()
}

export function getKeyMigrationReport(): Promise<KeyMigrationReport> {
  return api.get('api/account/key-migration').json<KeyMigrationReport>()
}

export async function deleteLegacyMemberKey(legacyMemberKeyVersion: number): Promise<void> {
  await api.delete('api/account/legacy-member-key', { searchParams: { legacyMemberKeyVersion } })
}

/** Compare-and-swap on the recipient key version the replaced envelope addresses; 409 when it moved. */
export async function replaceOwnMemberVaultKey(
  vaultId: string,
  expectedRecipientKeyVersion: number,
  envelope: MemberVaultKeyEnvelopeContract,
): Promise<void> {
  await api.put(`api/vaults/${encodeURIComponent(vaultId)}/members/me/key-envelope`, {
    json: { expectedRecipientKeyVersion, wrappedVaultKey: envelope.wrappedVaultKey }, retry: 0,
  })
}
