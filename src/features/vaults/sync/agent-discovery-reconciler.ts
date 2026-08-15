import { openVaultDerivedEnvelope, openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { createAgentDiscoveryMaterial } from '../../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../../shared/crypto/sodium'
import {
  getAgentDiscoveryProvisioning,
  provisionAgentDiscovery,
} from '../api/agent-discovery-api'
import { getEncryptedVault, listEncryptedVaults } from './member-sync-api'

const AGENT_MESSAGE_PRIVATE_PURPOSE = 3
const MANIFEST_SIGNING_PRIVATE_PURPOSE = 4
export const AGENT_DISCOVERY_RECONCILE_EVENT = 'palladin:agent-discovery-reconcile'

let activeReconciliation: Promise<void> | null = null

/**
 * Reconciles organization-wide Discovery eligibility while the Vault is
 * unlocked. The server supplies only public Agent keys; every VDK wrapper and
 * manifest signature is produced in-browser and secret key material is wiped
 * after each Vault.
 */
async function reconcileAgentDiscoveryPass(
  memberPrivateKey: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  const vaults = await listEncryptedVaults(signal)
  for (const summary of vaults) {
    signal.throwIfAborted()
    const vault = await getEncryptedVault(summary.id, signal)
    let vaultKey: Uint8Array | undefined
    let vdk: Uint8Array | undefined
    let agentMessagePrivateKey: Uint8Array | undefined
    let manifestSigningPrivateKey: Uint8Array | undefined
    try {
      vaultKey = await openMemberVaultKey(vault.memberVaultKey, memberPrivateKey)
      vdk = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
      const agentMessageEnvelope = vault.vaultPrivateKeys.find(
        (candidate) => candidate.descriptor.purpose === AGENT_MESSAGE_PRIVATE_PURPOSE,
      )
      const manifestSigningEnvelope = vault.vaultPrivateKeys.find(
        (candidate) => candidate.descriptor.purpose === MANIFEST_SIGNING_PRIVATE_PURPOSE,
      )
      if (!agentMessageEnvelope || !manifestSigningEnvelope) {
        throw new Error('Vault Discovery signing material is incomplete')
      }
      agentMessagePrivateKey = await openVaultDerivedEnvelope(agentMessageEnvelope, vaultKey)
      manifestSigningPrivateKey = await openVaultDerivedEnvelope(manifestSigningEnvelope, vaultKey)
      if (vdk.length !== 32 || agentMessagePrivateKey.length !== 32
        || (manifestSigningPrivateKey.length !== 32 && manifestSigningPrivateKey.length !== 64)) {
        throw new Error('Vault Discovery key material has an invalid length')
      }

      let afterId: string | undefined
      do {
        signal.throwIfAborted()
        const page = await getAgentDiscoveryProvisioning(vault.id, afterId, signal)
        for (const agent of page.items) {
          if (agent.status === 'current') continue
          signal.throwIfAborted()
          const material = await createAgentDiscoveryMaterial(agent, {
            organizationId: vault.organizationId,
            vaultId: vault.id,
          }, {
            vdkVersion: vault.currentKeyEpoch.vdkVersion,
            agentMessageKeyVersion: vault.currentKeyEpoch.agentMessageKeyVersion,
            manifestSigningKeyVersion: vault.currentKeyEpoch.manifestSigningKeyVersion,
          }, { vdk, agentMessagePrivateKey, manifestSigningPrivateKey })
          await provisionAgentDiscovery(vault.id, agent.agentId, material, signal)
        }
        afterId = page.nextAfterId ?? undefined
      } while (afterId)
    } finally {
      if (vaultKey) wipe(vaultKey)
      if (vdk) wipe(vdk)
      if (agentMessagePrivateKey) wipe(agentMessagePrivateKey)
      if (manifestSigningPrivateKey) wipe(manifestSigningPrivateKey)
    }
  }
}

/**
 * Serializes reconciliation across approval, Vault creation and the background
 * provider. A pass queued behind an older one runs afterwards so an Agent that
 * became active during the older snapshot cannot be missed.
 */
export async function reconcileAgentDiscovery(
  memberPrivateKey: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  while (activeReconciliation) {
    await activeReconciliation.catch(() => undefined)
    signal.throwIfAborted()
  }

  const pass = reconcileAgentDiscoveryPass(memberPrivateKey, signal)
  activeReconciliation = pass
  try {
    await pass
  } finally {
    if (activeReconciliation === pass) activeReconciliation = null
  }
}
