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
  memberKeyVersion: number
  memberKeySuiteId: string
  legacyMemberEnvelopes: number
  legacyAgentEnvelopes: number
}

export function submitSecurityUpgrade(request: SecurityUpgradeRequest): Promise<void> {
  return api.post('api/account/security-upgrade', { json: request, retry: 0 }).json<void>()
}

export function getKeyMigrationReport(): Promise<KeyMigrationReport> {
  return api.get('api/account/key-migration').json<KeyMigrationReport>()
}

export async function deleteLegacyMemberKey(legacyMemberKeyVersion: number): Promise<void> {
  await api.delete('api/account/legacy-member-key', { json: { legacyMemberKeyVersion } })
}

export async function replaceOwnMemberVaultKey(
  vaultId: string,
  envelope: MemberVaultKeyEnvelopeContract,
): Promise<void> {
  await api.put(`api/vaults/${encodeURIComponent(vaultId)}/members/me/key-envelope`, { json: envelope, retry: 0 })
}
