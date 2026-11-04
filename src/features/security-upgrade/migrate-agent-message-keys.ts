import { KEY_WRAPPER_SUITE, isKeyMigrationPending, type RecipientPrivateKey } from '../../shared/crypto/key-wrapper'
import { createAgentMessageKeyMigration } from '../../shared/crypto/create-vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { createAgentDiscoveryMaterial } from '../../shared/crypto/vault-v2-rotation'
import { ENVELOPE_PURPOSE } from '../../shared/crypto/envelope'
import {
  claimRotation,
  commitRotation,
  getRotationAgents,
  prepareRotationBatch,
  RotationHttpError,
  startAgentMessageKeyMigration,
  type RotationAgentSource,
} from '../vaults/rotation/rotation-api'
import { getEncryptedVault, type EncryptedVaultSummary } from '../vaults/sync/member-sync-api'

async function listAgents(vaultId: string, signal: AbortSignal): Promise<RotationAgentSource[]> {
  const agents: RotationAgentSource[] = []
  let afterId: string | null = null
  do {
    const page = await getRotationAgents(vaultId, afterId, signal)
    agents.push(...page.items)
    afterId = page.nextAfterId
  } while (afterId)
  return agents
}

/**
 * Publishes an active-suite Vault Agent message key for one Vault through the
 * agent-message-only rotation: the new private key under the unchanged VK, the
 * public anchor and a successor manifest per Agent. Agents still on a
 * read-only suite are skipped and re-provisioned by Discovery reconciliation
 * once they rotate. Pending reasons sealed to the old key are invalidated at commit.
 */
export async function migrateVaultAgentMessageKey(
  summary: Pick<EncryptedVaultSummary, 'id'>,
  memberKey: RecipientPrivateKey,
  signal: AbortSignal,
): Promise<'migrated' | 'current'> {
  const rotation = await startAgentMessageKeyMigration(summary.id, signal)
  if (!rotation) return 'current'
  const claim = await claimRotation(summary.id, rotation.id, signal)
  const vault = await getEncryptedVault(summary.id, signal)
  const target = rotation.targetKeyEpoch
  const currentMessage = vault.vaultPrivateKeys.find((envelope) =>
    envelope.descriptor.purpose === ENVELOPE_PURPOSE.agentMessagePrivateByVk
    && envelope.descriptor.keyVersion === vault.currentKeyEpoch.agentMessageKeyVersion)
  const signingEnvelope = vault.vaultPrivateKeys.find((envelope) =>
    envelope.descriptor.purpose === ENVELOPE_PURPOSE.manifestPrivateByVk
    && envelope.descriptor.keyVersion === vault.currentKeyEpoch.manifestSigningKeyVersion)
  if (!currentMessage || !signingEnvelope) throw new Error('Vault key material is incomplete')

  let vaultKey: Uint8Array | undefined
  let vdk: Uint8Array | undefined
  let signingKey: Uint8Array | undefined
  let messageKey: Uint8Array | undefined
  try {
    vaultKey = await openMemberVaultKey(vault.memberVaultKey, memberKey)
    vdk = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
    signingKey = await openVaultDerivedEnvelope(signingEnvelope, vaultKey)
    const migration = await createAgentMessageKeyMigration({
      organizationId: vault.organizationId,
      vaultId: vault.id,
      vaultKey,
      vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
      memberKeyGeneration: vault.memberKeyGeneration,
      currentEnvelopeRevision: currentMessage.descriptor.resourceRevision,
      targetKeyVersion: target.agentMessageKeyVersion,
    })
    messageKey = migration.privateKey
    const agentDiscoveries = []
    for (const agent of await listAgents(vault.id, signal)) {
      try {
        const material = await createAgentDiscoveryMaterial({
          agentId: agent.agentId, encryptionPublicKey: agent.publicKey, encryptionKeySuiteId: agent.keySuiteId,
          ed25519PublicKey: agent.ed25519PublicKey, recipientKeyVersion: agent.recipientKeyVersion,
          manifestRevision: agent.manifestRevision,
        }, { organizationId: vault.organizationId, vaultId: vault.id }, {
          vdkVersion: target.vdkVersion,
          agentMessageKeyVersion: target.agentMessageKeyVersion,
          manifestSigningKeyVersion: target.manifestSigningKeyVersion,
        }, { vdk, agentMessagePrivateKey: messageKey, agentMessageKeySuiteId: migration.keySuiteId, manifestSigningPrivateKey: signingKey })
        agentDiscoveries.push({ agentId: agent.agentId, envelope: material.envelope, manifest: material.manifest })
      } catch (error) {
        if (!isKeyMigrationPending(error)) throw error
      }
    }
    await prepareRotationBatch(vault.id, rotation.id, claim.fencingToken, {
      vaultPrivateKeys: [migration.privateKeyEnvelope],
      vaultAgentMessagePublicKey: migration.publicKey,
      agentDiscoveries,
    }, signal)
    const committed = await commitRotation(vault.id, rotation.id, claim.fencingToken, signal)
    if (!committed.ok) throw new RotationHttpError(committed.status)
    return 'migrated'
  } finally {
    if (vaultKey) wipe(vaultKey)
    if (vdk) wipe(vdk)
    if (signingKey) wipe(signingKey)
    if (messageKey) wipe(messageKey)
  }
}

export function needsAgentMessageKeyMigration(vaultAgentMessageKeySuiteId: string | undefined): boolean {
  return vaultAgentMessageKeySuiteId !== KEY_WRAPPER_SUITE.active
}
