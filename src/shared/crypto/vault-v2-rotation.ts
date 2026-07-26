import { concatBytes, decodeBase64Url, encodeBase64Url, encodeU16, encodeUtf8 } from './vault-v2-bytes'
import { decryptVaultEnvelope, encryptVaultEnvelope, sealVaultProtocolPackage } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import { VAULT_ALGORITHM_SUITE, VAULT_PROTOCOL_VERSION, type VaultEnvelopeHeader } from './vault-v2-protocol'
import { canonicalizeVaultJson, signVaultObject, type CanonicalJson } from './vault-v2-signatures'
import { loadSodium, randomBytes, wipe } from './sodium'

export interface RotationKeyEnvelope {
  [key: string]: unknown
  organizationId: string; vaultId: string; header: VaultEnvelopeHeader; ciphertext: string
}

export interface RotationDiscoveryKeyEnvelope extends RotationKeyEnvelope {
  discoveryKeyRevision: string; vdkVersion: number; memberKeyGeneration: number; wrappingKeyVersion: number
}

export interface RotationPrivateKeyEnvelope extends RotationKeyEnvelope {
  privateKeyKind: 1 | 2; privateKeyRevision: string; privateKeyVersion: number
  memberKeyGeneration: number; wrappingKeyVersion: number
}

export interface RotationEntryKeyEnvelope {
  [key: string]: unknown
  organizationId: string; vaultId: string; entryId: string; wrapperRevision: string
  keyVersion: number; memberKeyGeneration: number; wrappingKeyVersion: number
  header: VaultEnvelopeHeader; wrappedEntryDekByVk: string
}

export interface RotationDiscoveryEnvelope extends RotationKeyEnvelope {
  entryId: string; agentDiscoveryRevision: string; vdkVersion: number
}

function nextRevision(value: string): string { return (BigInt(value) + 1n).toString() }
function jsonBytes(value: CanonicalJson): Uint8Array { return encodeUtf8(canonicalizeVaultJson(value)) }

export async function vaultKeyFingerprint(publicKey: Uint8Array, keyKind: 1 | 2 | 3 | 4 | 5): Promise<string> {
  if (publicKey.length !== 32) throw new Error('Vault public key must be 32 bytes')
  const input = concatBytes(encodeUtf8('PLDNV2FP'), encodeU16(2), encodeU16(keyKind), publicKey)
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(input).buffer)
  return encodeBase64Url(new Uint8Array(digest))
}

export async function openDiscoveryKey(envelope: RotationDiscoveryKeyEnvelope, vaultKey: Uint8Array): Promise<Uint8Array> {
  const key = await decryptVaultEnvelope('vault-discovery-key', envelope, vaultKey, {
    aadContext: envelope, minimumMemberKeyGeneration: envelope.memberKeyGeneration,
  })
  if (key.length !== 32) { wipe(key); throw new Error('VDK must be 32 bytes') }
  return key
}

export async function openVaultPrivateKey(envelope: RotationPrivateKeyEnvelope, vaultKey: Uint8Array): Promise<Uint8Array> {
  const key = await decryptVaultEnvelope('vault-private-key', envelope, vaultKey, {
    aadContext: envelope, minimumMemberKeyGeneration: envelope.memberKeyGeneration,
  })
  if (key.length !== 32) { wipe(key); throw new Error('Vault private key seed must be 32 bytes') }
  return key
}

export async function createDiscoveryKeyEnvelope(source: RotationDiscoveryKeyEnvelope, rawKey: Uint8Array, vaultKey: Uint8Array, target: { vdkVersion: number; memberKeyGeneration: number; vaultKeyVersion: number }) {
  const discoveryKeyRevision = nextRevision(source.discoveryKeyRevision)
  const context = {
    organizationId: source.organizationId, vaultId: source.vaultId, discoveryKeyRevision,
    vdkVersion: target.vdkVersion, memberKeyGeneration: target.memberKeyGeneration,
    wrappingKeyVersion: target.vaultKeyVersion,
    header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 1, projectionKind: 12,
      resourceRevision: discoveryKeyRevision, keyVersion: target.vdkVersion,
      memberKeyGeneration: target.memberKeyGeneration, nonce: '' },
  }
  const encrypted = await encryptVaultEnvelope('vault-discovery-key', context, rawKey, vaultKey)
  return { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
}

export async function createPrivateKeyEnvelope(source: RotationPrivateKeyEnvelope, seed: Uint8Array, vaultKey: Uint8Array, target: { privateKeyVersion: number; memberKeyGeneration: number; vaultKeyVersion: number }) {
  const privateKeyRevision = nextRevision(source.privateKeyRevision)
  const context = {
    organizationId: source.organizationId, vaultId: source.vaultId, privateKeyKind: source.privateKeyKind,
    privateKeyRevision, privateKeyVersion: target.privateKeyVersion,
    memberKeyGeneration: target.memberKeyGeneration, wrappingKeyVersion: target.vaultKeyVersion,
    header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 1, projectionKind: 7,
      resourceRevision: privateKeyRevision, keyVersion: target.privateKeyVersion,
      memberKeyGeneration: target.memberKeyGeneration, nonce: '' },
  }
  const encrypted = await encryptVaultEnvelope('vault-private-key', context, seed, vaultKey)
  return { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
}

export async function sealMemberVaultKey(recipient: { memberId: string; recipientKeyVersion: number; recipientKeyFingerprint: string; x25519PublicKey: string }, scope: { organizationId: string; vaultId: string; vkVersion: number; memberKeyGeneration: number }, vaultKey: Uint8Array) {
  const publicKey = decodeBase64Url(recipient.x25519PublicKey, 32)
  if (await vaultKeyFingerprint(publicKey, 5) !== recipient.recipientKeyFingerprint) throw new Error('Member key directory fingerprint mismatch')
  const plaintext = jsonBytes({ protocolVersion: 2, organizationId: scope.organizationId, vaultId: scope.vaultId,
    memberId: recipient.memberId, vkVersion: scope.vkVersion, memberKeyGeneration: scope.memberKeyGeneration,
    vaultKey: encodeBase64Url(vaultKey) })
  try {
    const sealed = await sealVaultProtocolPackage(plaintext, publicKey)
    return { protocolVersion: 2, algorithmSuite: 1, ...scope, memberId: recipient.memberId,
      recipientMemberKeyVersion: recipient.recipientKeyVersion,
      recipientMemberKeyFingerprint: recipient.recipientKeyFingerprint, sealedVaultKeyPackage: encodeBase64Url(sealed) }
  } finally { wipe(publicKey); wipe(plaintext) }
}

export async function rewrapEntryKey(source: RotationEntryKeyEnvelope, currentVaultKey: Uint8Array, targetVaultKey: Uint8Array, target: { memberKeyGeneration: number; vaultKeyVersion: number }) {
  const entryDek = await decryptVaultEnvelope('entry-key-wrapper', source, currentVaultKey, {
    aadContext: source, minimumMemberKeyGeneration: source.memberKeyGeneration,
  })
  try {
    if (entryDek.length !== 32) throw new Error('EntryDEK must be 32 bytes')
    const wrapperRevision = nextRevision(source.wrapperRevision)
    const context = { organizationId: source.organizationId, vaultId: source.vaultId, entryId: source.entryId,
      wrapperRevision, keyVersion: source.keyVersion, memberKeyGeneration: target.memberKeyGeneration,
      wrappingKeyVersion: target.vaultKeyVersion,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 8,
        resourceRevision: wrapperRevision, keyVersion: source.keyVersion,
        memberKeyGeneration: target.memberKeyGeneration, nonce: '' } }
    const encrypted = await encryptVaultEnvelope('entry-key-wrapper', context, entryDek, targetVaultKey)
    return { ...context, header: { ...context.header, nonce: encrypted.nonce }, wrappedEntryDekByVk: encrypted.ciphertext }
  } finally { wipe(entryDek) }
}

export async function rotateDiscovery(source: RotationDiscoveryEnvelope, currentVdk: Uint8Array, targetVdk: Uint8Array, target: { vdkVersion: number; memberKeyGeneration: number }) {
  const currentKey = await deriveVaultProjectionKey({ baseKey: currentVdk, purpose: 'agent-discovery', resourceKind: 2,
    organizationId: source.organizationId, vaultId: source.vaultId, entryId: source.entryId,
    keyVersion: source.vdkVersion, memberKeyGeneration: source.header.memberKeyGeneration })
  let plaintext: Uint8Array | undefined
  let targetKey: Uint8Array | undefined
  try {
    plaintext = await decryptVaultEnvelope('agent-discovery', source, currentKey, {
      aadContext: source, minimumMemberKeyGeneration: source.header.memberKeyGeneration,
    })
    targetKey = await deriveVaultProjectionKey({ baseKey: targetVdk, purpose: 'agent-discovery', resourceKind: 2,
      organizationId: source.organizationId, vaultId: source.vaultId, entryId: source.entryId,
      keyVersion: target.vdkVersion, memberKeyGeneration: target.memberKeyGeneration })
    const context = { organizationId: source.organizationId, vaultId: source.vaultId, entryId: source.entryId,
      agentDiscoveryRevision: source.agentDiscoveryRevision, vdkVersion: target.vdkVersion,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 4,
        resourceRevision: source.agentDiscoveryRevision, keyVersion: target.vdkVersion,
        memberKeyGeneration: target.memberKeyGeneration, nonce: '' } }
    const encrypted = await encryptVaultEnvelope('agent-discovery', context, plaintext, targetKey)
    return { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
  } finally { wipe(currentKey); if (plaintext) wipe(plaintext); if (targetKey) wipe(targetKey) }
}

export async function rotateVaultMetadata(source: RotationKeyEnvelope & { metadataRevision: string }, currentVaultKey: Uint8Array, targetVaultKey: Uint8Array, target: { vaultKeyVersion: number; memberKeyGeneration: number }) {
  const currentKey = await deriveVaultProjectionKey({ baseKey: currentVaultKey, purpose: 'member-vault-metadata',
    resourceKind: 1, organizationId: source.organizationId, vaultId: source.vaultId,
    keyVersion: source.header.keyVersion, memberKeyGeneration: source.header.memberKeyGeneration })
  let plaintext: Uint8Array | undefined
  let targetKey: Uint8Array | undefined
  try {
    plaintext = await decryptVaultEnvelope('member-vault-metadata', source, currentKey, {
      aadContext: source, minimumMemberKeyGeneration: source.header.memberKeyGeneration,
    })
    targetKey = await deriveVaultProjectionKey({ baseKey: targetVaultKey, purpose: 'member-vault-metadata',
      resourceKind: 1, organizationId: source.organizationId, vaultId: source.vaultId,
      keyVersion: target.vaultKeyVersion, memberKeyGeneration: target.memberKeyGeneration })
    const metadataRevision = nextRevision(source.metadataRevision)
    const context = { organizationId: source.organizationId, vaultId: source.vaultId, metadataRevision,
      header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 1, projectionKind: 1,
        resourceRevision: metadataRevision, keyVersion: target.vaultKeyVersion,
        memberKeyGeneration: target.memberKeyGeneration, nonce: '' } }
    const encrypted = await encryptVaultEnvelope('member-vault-metadata', context, plaintext, targetKey)
    return { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }
  } finally {
    wipe(currentKey)
    if (plaintext) wipe(plaintext)
    if (targetKey) wipe(targetKey)
  }
}

function canonicalInstant(now: Date): string {
  const iso = now.toISOString()
  return iso.endsWith('.000Z') ? `${iso.slice(0, -5)}Z` : iso.replace(/0+Z$/, 'Z')
}

export async function createAgentDiscoveryMaterial(agent: { agentId: string; x25519PublicKey: string; ed25519PublicKey: string; recipientKeyVersion: number; manifestRevision: string | null }, scope: { organizationId: string; vaultId: string }, versions: { vdkVersion: number; agentMessageKeyVersion: number; manifestSigningKeyVersion: number }, keys: { vdk: Uint8Array; agentMessagePrivateKey: Uint8Array; manifestSigningSeed: Uint8Array }, now = new Date()) {
  const sodium = await loadSodium()
  const agentX = sodium.from_base64(agent.x25519PublicKey, sodium.base64_variants.ORIGINAL)
  const agentEd = sodium.from_base64(agent.ed25519PublicKey, sodium.base64_variants.ORIGINAL)
  const messagePublic = sodium.crypto_scalarmult_base(keys.agentMessagePrivateKey)
  const signing = sodium.crypto_sign_seed_keypair(keys.manifestSigningSeed)
  const payload = jsonBytes({ protocolVersion: 2, ...scope, agentId: agent.agentId,
    vdkVersion: versions.vdkVersion, vdk: encodeBase64Url(keys.vdk) })
  try {
    const wrapped = await sealVaultProtocolPackage(payload, agentX)
    const digestInput = concatBytes(encodeUtf8('PLDNV2DG:AGENT-WRAPPED-VDK:'), encodeU16(2), wrapped)
    const wrappedDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(digestInput).buffer))
    const manifestRevision = (BigInt(agent.manifestRevision ?? '0') + 1n).toString()
    const unsigned = {
      protocolVersion: VAULT_PROTOCOL_VERSION, algorithmSuite: VAULT_ALGORITHM_SUITE, ...scope, agentId: agent.agentId,
      agentX25519Fingerprint: await vaultKeyFingerprint(agentX, 1),
      agentEd25519Fingerprint: await vaultKeyFingerprint(agentEd, 2),
      vaultSigningPublicKey: encodeBase64Url(signing.publicKey),
      vaultSigningKeyFingerprint: await vaultKeyFingerprint(signing.publicKey, 3),
      manifestSigningKeyVersion: versions.manifestSigningKeyVersion,
      vaultAgentMessagePublicKey: encodeBase64Url(messagePublic),
      vaultAgentMessageKeyFingerprint: await vaultKeyFingerprint(messagePublic, 4),
      agentMessageKeyVersion: versions.agentMessageKeyVersion, vdkVersion: versions.vdkVersion,
      agentWrappedVdkDigest: encodeBase64Url(wrappedDigest), manifestRevision,
      issuedAt: canonicalInstant(now), minimumAgentRuntimeProtocol: 2,
    }
    const signature = await signVaultObject('PLDNV2SIG:VAULT-MANIFEST:', unsigned, signing.privateKey)
    const envelope = { protocolVersion: 2, ...scope, agentId: agent.agentId, vdkVersion: versions.vdkVersion,
      algorithmSuite: 1, recipientAgentKeyVersion: agent.recipientKeyVersion,
      recipientAgentKeyFingerprint: unsigned.agentX25519Fingerprint, agentWrappedVdk: encodeBase64Url(wrapped),
      manifestRevision, manifestSignature: signature }
    return { agentId: agent.agentId, envelope, manifest: { ...unsigned, signature } }
  } finally {
    // Public keys are not secret. Wipe only the signing secret and sealed-package plaintext.
    wipe(signing.privateKey); wipe(payload)
  }
}

export async function generateRotationKeys() {
  const sodium = await loadSodium()
  const vaultKey = await randomBytes(32)
  const vdk = await randomBytes(32)
  const agentMessage = sodium.crypto_box_keypair()
  const manifestSigningSeed = await randomBytes(32)
  return { vaultKey, vdk, agentMessagePrivateKey: agentMessage.privateKey, manifestSigningSeed }
}
