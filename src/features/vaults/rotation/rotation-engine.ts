import { openMemberVaultKey } from '../../../shared/crypto/vault-v2-member-sync'
import {
  createAgentDiscoveryMaterial, createDiscoveryKeyEnvelope, createPrivateKeyEnvelope,
  generateRotationKeys, openDiscoveryKey, openVaultPrivateKey, rewrapEntryKey,
  rotateDiscovery, rotateVaultMetadata, sealMemberVaultKey,
  type RotationDiscoveryKeyEnvelope, type RotationPrivateKeyEnvelope,
} from '../../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../../shared/crypto/sodium'
import {
  claimRotation, commitRotation, getRotationAgents, getRotationDiscoveries, getRotationEntryKeys,
  getRotationMembers, getVaultMetadata, listPendingRotations, prepareRotationBatch,
  type RotationClaim, type VaultRotation,
} from './rotation-api'
import { useRotationStore, type RotationPhase } from './rotation-store'

const LEASE_RENEW_AFTER_MS = 55_000
const MAXIMUM_COMMIT_RECONCILIATIONS = 3

interface RotationSecrets {
  currentVaultKey: Uint8Array
  targetVaultKey: Uint8Array
  currentVdk: Uint8Array
  targetVdk: Uint8Array
  targetAgentMessagePrivateKey: Uint8Array
  targetManifestSigningSeed: Uint8Array
  pendingDiscoveryKey: unknown | null
  pendingPrivateKeys: unknown[]
  destroy(): void
}

function progress(phase: RotationPhase, rotation: VaultRotation, processedItems?: number) {
  useRotationStore.getState().update({ phase, vaultId: rotation.vaultId, rotationId: rotation.id,
    ...(processedItems === undefined ? {} : { processedItems }) })
}

function isScope(rotation: VaultRotation, name: string): boolean { return rotation.scope.includes(name) }
function samePlan(left: VaultRotation, right: VaultRotation): boolean {
  return left.id === right.id && left.vaultId === right.vaultId
    && left.baseMemberKeyGeneration === right.baseMemberKeyGeneration
    && left.targetMemberKeyGeneration === right.targetMemberKeyGeneration
    && JSON.stringify(left.baseKeyEpoch) === JSON.stringify(right.baseKeyEpoch)
    && JSON.stringify(left.targetKeyEpoch) === JSON.stringify(right.targetKeyEpoch)
}

class RotationLease {
  private claimedAt = Date.now()
  private claimValue: RotationClaim
  private readonly signal: AbortSignal
  private seedVerifier: ((claim: RotationClaim) => Promise<void>) | null = null
  constructor(claimValue: RotationClaim, signal: AbortSignal) {
    this.claimValue = claimValue
    this.signal = signal
  }
  get claim() { return this.claimValue }
  get token() { return this.claimValue.fencingToken }
  setSeedVerifier(verifier: (claim: RotationClaim) => Promise<void>) { this.seedVerifier = verifier }
  async renewIfNeeded(seedEstablished: boolean): Promise<void> {
    if (Date.now() - this.claimedAt < LEASE_RENEW_AFTER_MS) return
    const renewed = await claimRotation(this.claimValue.rotation.vaultId, this.claimValue.rotation.id, this.signal)
    if (!samePlan(this.claimValue.rotation, renewed.rotation)) throw new Error('rotation-plan-changed')
    if (seedEstablished && renewed.preparedMaterialReset) throw new Error('rotation-seed-reset')
    if (seedEstablished) {
      if (!this.seedVerifier) throw new Error('rotation-seed-verifier-missing')
      await this.seedVerifier(renewed)
    }
    this.claimValue = renewed
    this.claimedAt = Date.now()
  }
}

function equalSecret(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

async function verifyPendingSeed(claim: RotationClaim, secrets: RotationSecrets, memberPrivateKey: Uint8Array): Promise<void> {
  const rotation = claim.rotation
  const opened: Uint8Array[] = []
  try {
    if (isScope(rotation, 'VaultKey')) {
      if (!claim.pendingMemberVaultKey) throw new Error('rotation-pending-vault-key-missing')
      opened.push(await openMemberVaultKey(claim.pendingMemberVaultKey, {
        organizationId: claim.pendingMemberVaultKey.organizationId, vaultId: rotation.vaultId,
        memberId: claim.pendingMemberVaultKey.memberId, vkVersion: rotation.targetKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: rotation.targetMemberKeyGeneration,
      }, memberPrivateKey))
      if (!equalSecret(opened.at(-1)!, secrets.targetVaultKey)) throw new Error('rotation-seed-changed')
    }
    if (isScope(rotation, 'VaultKey') || isScope(rotation, 'Vdk')) {
      if (!claim.pendingDiscoveryKey) throw new Error('rotation-pending-vdk-missing')
      opened.push(await openDiscoveryKey(claim.pendingDiscoveryKey as RotationDiscoveryKeyEnvelope, secrets.targetVaultKey))
      if (!equalSecret(opened.at(-1)!, secrets.targetVdk)) throw new Error('rotation-seed-changed')
    }
    const pending = new Map(claim.pendingVaultPrivateKeys.map((item) => [item.privateKeyKind, item]))
    for (const kind of [1, 2] as const) {
      const rotated = kind === 1 ? isScope(rotation, 'AgentMessage') : isScope(rotation, 'ManifestSigning')
      if (!isScope(rotation, 'VaultKey') && !rotated) continue
      const envelope = pending.get(kind)
      if (!envelope) throw new Error('rotation-pending-private-key-missing')
      opened.push(await openVaultPrivateKey(envelope as RotationPrivateKeyEnvelope, secrets.targetVaultKey))
      const expected = kind === 1 ? secrets.targetAgentMessagePrivateKey : secrets.targetManifestSigningSeed
      if (!equalSecret(opened.at(-1)!, expected)) throw new Error('rotation-seed-changed')
    }
  } finally { for (const key of opened) wipe(key) }
}

async function loadSecrets(claim: RotationClaim, memberPrivateKey: Uint8Array): Promise<RotationSecrets> {
  const rotation = claim.rotation
  const currentVaultKey = await openMemberVaultKey(claim.currentMemberVaultKey, {
    organizationId: claim.currentMemberVaultKey.organizationId, vaultId: rotation.vaultId,
    memberId: claim.currentMemberVaultKey.memberId, vkVersion: rotation.baseKeyEpoch.vaultKeyVersion,
    memberKeyGeneration: rotation.baseMemberKeyGeneration,
  }, memberPrivateKey)
  let targetVaultKey: Uint8Array | undefined
  let currentVdk: Uint8Array | undefined
  let targetVdk: Uint8Array | undefined
  let targetMessage: Uint8Array | undefined
  let targetSigning: Uint8Array | undefined
  const generated = await generateRotationKeys()
  try {
    targetVaultKey = claim.pendingMemberVaultKey
      ? await openMemberVaultKey(claim.pendingMemberVaultKey, {
          organizationId: claim.pendingMemberVaultKey.organizationId, vaultId: rotation.vaultId,
          memberId: claim.pendingMemberVaultKey.memberId, vkVersion: rotation.targetKeyEpoch.vaultKeyVersion,
          memberKeyGeneration: rotation.targetMemberKeyGeneration,
        }, memberPrivateKey)
      : new Uint8Array(isScope(rotation, 'VaultKey') ? generated.vaultKey : currentVaultKey)
    currentVdk = await openDiscoveryKey(claim.currentDiscoveryKey as RotationDiscoveryKeyEnvelope, currentVaultKey)
    targetVdk = claim.pendingDiscoveryKey
      ? await openDiscoveryKey(claim.pendingDiscoveryKey as RotationDiscoveryKeyEnvelope, targetVaultKey)
      : new Uint8Array(isScope(rotation, 'Vdk') ? generated.vdk : currentVdk)

    const currentPrivate = new Map(claim.currentVaultPrivateKeys.map((item) => [item.privateKeyKind, item]))
    const pendingPrivate = new Map(claim.pendingVaultPrivateKeys.map((item) => [item.privateKeyKind, item]))
    const loadTargetPrivate = async (kind: 1 | 2, rotates: boolean, generatedSeed: Uint8Array) => {
      const pending = pendingPrivate.get(kind)
      if (pending) return openVaultPrivateKey(pending as RotationPrivateKeyEnvelope, targetVaultKey!)
      if (rotates) return new Uint8Array(generatedSeed)
      const current = currentPrivate.get(kind)
      if (!current) throw new Error('current-vault-private-key-missing')
      return openVaultPrivateKey(current as RotationPrivateKeyEnvelope, currentVaultKey)
    }
    targetMessage = await loadTargetPrivate(1, isScope(rotation, 'AgentMessage'), generated.agentMessagePrivateKey)
    targetSigning = await loadTargetPrivate(2, isScope(rotation, 'ManifestSigning'), generated.manifestSigningSeed)

    const keyMaterialRequiredByVk = isScope(rotation, 'VaultKey')
    const pendingDiscoveryKey = claim.pendingDiscoveryKey ?? (keyMaterialRequiredByVk || isScope(rotation, 'Vdk')
      ? await createDiscoveryKeyEnvelope(claim.currentDiscoveryKey as RotationDiscoveryKeyEnvelope, targetVdk, targetVaultKey, {
          vdkVersion: rotation.targetKeyEpoch.vdkVersion, memberKeyGeneration: rotation.targetMemberKeyGeneration,
          vaultKeyVersion: rotation.targetKeyEpoch.vaultKeyVersion,
        }) : null)
    const pendingPrivateKeys: unknown[] = []
    for (const kind of [1, 2] as const) {
      const pending = pendingPrivate.get(kind)
      if (pending) { pendingPrivateKeys.push(pending); continue }
      const rotates = kind === 1 ? isScope(rotation, 'AgentMessage') : isScope(rotation, 'ManifestSigning')
      if (!keyMaterialRequiredByVk && !rotates) continue
      const source = currentPrivate.get(kind)
      if (!source) throw new Error('current-vault-private-key-missing')
      pendingPrivateKeys.push(await createPrivateKeyEnvelope(source as RotationPrivateKeyEnvelope,
        kind === 1 ? targetMessage : targetSigning, targetVaultKey, {
          privateKeyVersion: kind === 1 ? rotation.targetKeyEpoch.agentMessageKeyVersion : rotation.targetKeyEpoch.manifestSigningKeyVersion,
          memberKeyGeneration: rotation.targetMemberKeyGeneration, vaultKeyVersion: rotation.targetKeyEpoch.vaultKeyVersion,
        }))
    }
    return {
      currentVaultKey, targetVaultKey, currentVdk, targetVdk,
      targetAgentMessagePrivateKey: targetMessage, targetManifestSigningSeed: targetSigning,
      pendingDiscoveryKey, pendingPrivateKeys,
      destroy() { for (const key of [currentVaultKey, targetVaultKey!, currentVdk!, targetVdk!, targetMessage!, targetSigning!]) wipe(key) },
    }
  } catch (error) {
    wipe(currentVaultKey)
    for (const key of [targetVaultKey, currentVdk, targetVdk, targetMessage, targetSigning]) if (key) wipe(key)
    throw error
  } finally {
    wipe(generated.vaultKey); wipe(generated.vdk); wipe(generated.agentMessagePrivateKey); wipe(generated.manifestSigningSeed)
  }
}

export class VaultRotationEngine {
  async run(memberId: string, memberPrivateKey: Uint8Array, signal: AbortSignal): Promise<void> {
    const rotations = await listPendingRotations(signal)
    for (const rotation of rotations) {
      if (signal.aborted) throw signal.reason
      await this.runRotation(rotation, memberId, memberPrivateKey, signal)
    }
    useRotationStore.getState().clear()
  }

  private async runRotation(rotation: VaultRotation, memberId: string, memberPrivateKey: Uint8Array, signal: AbortSignal) {
    progress('claiming', rotation, 0)
    const lease = new RotationLease(await claimRotation(rotation.vaultId, rotation.id, signal), signal)
    if (!samePlan(rotation, lease.claim.rotation)) throw new Error('rotation-plan-changed')
    const secrets = await loadSecrets(lease.claim, memberPrivateKey)
    lease.setSeedVerifier((renewed) => verifyPendingSeed(renewed, secrets, memberPrivateKey))
    let seedEstablished = Boolean(lease.claim.pendingDiscoveryKey || lease.claim.pendingVaultPrivateKeys.length || lease.claim.pendingMemberVaultKey)
    let processed = 0
    try {
      progress('seeding', rotation)
      if (isScope(rotation, 'VaultKey')) {
        const self = await this.findMember(rotation, lease, memberId, seedEstablished, signal)
        const selfEnvelope = await sealMemberVaultKey(self, {
          organizationId: lease.claim.currentMemberVaultKey.organizationId, vaultId: rotation.vaultId,
          vkVersion: rotation.targetKeyEpoch.vaultKeyVersion, memberKeyGeneration: rotation.targetMemberKeyGeneration,
        }, secrets.targetVaultKey)
        await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, {
          memberVaultKeys: [selfEnvelope], discoveryKey: secrets.pendingDiscoveryKey,
          vaultPrivateKeys: secrets.pendingPrivateKeys,
        }, signal)
      } else if (!seedEstablished) {
        await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, {
          discoveryKey: secrets.pendingDiscoveryKey, vaultPrivateKeys: secrets.pendingPrivateKeys,
        }, signal)
      }
      seedEstablished = true
      for (let attempt = 0; attempt < MAXIMUM_COMMIT_RECONCILIATIONS; attempt += 1) {
        processed += await this.prepareAll(rotation, lease, secrets, seedEstablished, signal)
        progress('committing', rotation, processed)
        await lease.renewIfNeeded(seedEstablished)
        const commit = await commitRotation(rotation.vaultId, rotation.id, lease.token, signal)
        if (commit.ok) return
        if (commit.status !== 409) throw new Error(`rotation-commit-${commit.status}`)
        await commit.body?.cancel().catch(() => undefined)
      }
      throw new Error('rotation-remained-dirty')
    } finally { secrets.destroy() }
  }

  private async findMember(rotation: VaultRotation, lease: RotationLease, memberId: string, seedEstablished: boolean, signal: AbortSignal) {
    let cursor: string | null = null
    do {
      await lease.renewIfNeeded(seedEstablished)
      const page = await getRotationMembers(rotation.vaultId, rotation.id, lease.token, cursor, signal)
      const self = page.items.find((item) => item.memberId === memberId)
      if (self) return self
      cursor = page.nextAfterId
    } while (cursor)
    throw new Error('rotation-claimant-not-in-recipient-set')
  }

  private async prepareAll(rotation: VaultRotation, lease: RotationLease, secrets: RotationSecrets, seedEstablished: boolean, signal: AbortSignal): Promise<number> {
    let processed = 0
    if (isScope(rotation, 'VaultKey')) {
      progress('members', rotation)
      let cursor: string | null = null
      do {
        await lease.renewIfNeeded(seedEstablished)
        const page = await getRotationMembers(rotation.vaultId, rotation.id, lease.token, cursor, signal)
        const envelopes = []
        for (const recipient of page.items) envelopes.push(await sealMemberVaultKey(recipient, {
          organizationId: lease.claim.currentMemberVaultKey.organizationId, vaultId: rotation.vaultId,
          vkVersion: rotation.targetKeyEpoch.vaultKeyVersion, memberKeyGeneration: rotation.targetMemberKeyGeneration,
        }, secrets.targetVaultKey))
        if (envelopes.length) {
          await lease.renewIfNeeded(seedEstablished)
          await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, { memberVaultKeys: envelopes }, signal)
        }
        processed += envelopes.length
        cursor = page.nextAfterId
      } while (cursor)

      progress('metadata', rotation)
      await lease.renewIfNeeded(seedEstablished)
      const metadata = await getVaultMetadata(rotation.vaultId, signal)
      const rotatedMetadata = await rotateVaultMetadata(metadata, secrets.currentVaultKey, secrets.targetVaultKey, {
        vaultKeyVersion: rotation.targetKeyEpoch.vaultKeyVersion, memberKeyGeneration: rotation.targetMemberKeyGeneration,
      })
      await lease.renewIfNeeded(seedEstablished)
      await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, { memberVaultMetadata: rotatedMetadata }, signal)
      processed += 1

      progress('entry-keys', rotation)
      let afterId: string | null = null
      let afterVersion: number | null = null
      do {
        await lease.renewIfNeeded(seedEstablished)
        const page = await getRotationEntryKeys(rotation.vaultId, rotation.id, lease.token, afterId, afterVersion, signal)
        const keys = []
        for (const source of page.items) keys.push(await rewrapEntryKey(source, secrets.currentVaultKey, secrets.targetVaultKey, {
          memberKeyGeneration: rotation.targetMemberKeyGeneration, vaultKeyVersion: rotation.targetKeyEpoch.vaultKeyVersion,
        }))
        if (keys.length) {
          await lease.renewIfNeeded(seedEstablished)
          await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, { entryKeys: keys }, signal)
        }
        processed += keys.length
        afterId = page.nextAfterId; afterVersion = page.nextAfterVersion
      } while (afterId)
    }

    if (isScope(rotation, 'Vdk')) {
      progress('discoveries', rotation)
      let cursor: string | null = null
      do {
        await lease.renewIfNeeded(seedEstablished)
        const page = await getRotationDiscoveries(rotation.vaultId, rotation.id, lease.token, cursor, signal)
        const items = []
        for (const source of page.items) items.push({ sourceRevision: source.sourceRevision,
          envelope: await rotateDiscovery(source.envelope, secrets.currentVdk, secrets.targetVdk, {
            vdkVersion: rotation.targetKeyEpoch.vdkVersion, memberKeyGeneration: rotation.targetMemberKeyGeneration,
          }) })
        if (items.length) {
          await lease.renewIfNeeded(seedEstablished)
          await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, { entryDiscoveries: items }, signal)
        }
        processed += items.length
        cursor = page.nextAfterId
      } while (cursor)
    }

    if (isScope(rotation, 'Vdk') || isScope(rotation, 'AgentMessage') || isScope(rotation, 'ManifestSigning')) {
      progress('agents', rotation)
      let cursor: string | null = null
      do {
        await lease.renewIfNeeded(seedEstablished)
        const page = await getRotationAgents(rotation.vaultId, cursor, signal)
        const items = []
        for (const agent of page.items) items.push(await createAgentDiscoveryMaterial(agent, {
          organizationId: lease.claim.currentMemberVaultKey.organizationId, vaultId: rotation.vaultId,
        }, rotation.targetKeyEpoch, { vdk: secrets.targetVdk,
          agentMessagePrivateKey: secrets.targetAgentMessagePrivateKey,
          manifestSigningSeed: secrets.targetManifestSigningSeed }))
        if (items.length) {
          await lease.renewIfNeeded(seedEstablished)
          await prepareRotationBatch(rotation.vaultId, rotation.id, lease.token, { agentDiscoveries: items }, signal)
        }
        processed += items.length
        cursor = page.nextAfterId
      } while (cursor)
    }
    return processed
  }
}
