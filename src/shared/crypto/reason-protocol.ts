import { ENVELOPE_PURPOSE } from './envelope'
import { encodeCanonicalEnvelopeAad } from './canonical-aad'
import { fromBase64Url } from './encoding'
import { deriveVaultSubkey } from './hkdf'
import { loadSodium, wipe } from './sodium'
import { assertEnvelopeScope, openVaultEnvelope, toEnvelopeDescriptor, type VaultEnvelopeContract } from './vault-envelope'
import { openKeyFromX25519Recipient, VAULT_KEY_KIND, WRAPPER_PURPOSE, X25519_SEALED_BOX_V1, type X25519WrapperDescriptorContract } from './x25519-wrapper'

export type VaultPrivateKeyEnvelopeContract = VaultEnvelopeContract<{ wrappingVaultKeyVersion: number }>

export interface EncryptedReasonContract extends VaultEnvelopeContract<{
  wrapperSuiteId: string
  recipientKeyVersion: number
  recipientKeyFingerprint: string
  requestedMethods: number
}> {
  wrappedReasonDek: {
    descriptor: X25519WrapperDescriptorContract
    encodedSealedKeyPackage: string
  }
  agentSignature: string
}

export interface ExpectedReasonCoordinates {
  organizationId: string
  vaultId: string
  entryId: string
  grantId: string
  agentId: string
}

export async function openEncryptedReason(
  envelope: EncryptedReasonContract,
  privateKeys: VaultPrivateKeyEnvelopeContract[],
  vaultKey: Uint8Array,
  expected: ExpectedReasonCoordinates,
): Promise<string> {
  assertEnvelopeScope(envelope.descriptor, {
    purpose: ENVELOPE_PURPOSE.reason, organizationId: expected.organizationId,
    vaultId: expected.vaultId, entryId: expected.entryId,
    grantOrRequestId: expected.grantId, agentId: expected.agentId,
  })
  const wrapper = envelope.wrappedReasonDek.descriptor
  const privateEnvelope = privateKeys.find((candidate) =>
    candidate.descriptor.purpose === ENVELOPE_PURPOSE.agentMessagePrivateByVk
    && candidate.descriptor.keyVersion === wrapper.recipientKeyVersion)
  if (!privateEnvelope) throw new Error('Matching Vault Agent Message private key is unavailable')
  assertEnvelopeScope(privateEnvelope.descriptor, {
    purpose: ENVELOPE_PURPOSE.agentMessagePrivateByVk,
    organizationId: expected.organizationId, vaultId: expected.vaultId,
  })
  if (privateEnvelope.descriptor.memberKeyGeneration !== envelope.descriptor.memberKeyGeneration
    || wrapper.scope.organizationId !== expected.organizationId || wrapper.scope.vaultId !== expected.vaultId
    || wrapper.scope.entryId !== expected.entryId || wrapper.scope.grantOrRequestId !== expected.grantId
    || wrapper.scope.agentId !== expected.agentId || wrapper.protocolVersion !== 2
    || wrapper.wrapperSuiteId !== X25519_SEALED_BOX_V1 || wrapper.purpose !== WRAPPER_PURPOSE.reasonDek
    || wrapper.resourceRevision !== envelope.descriptor.resourceRevision
    || wrapper.wrappedKeyVersion !== envelope.descriptor.keyVersion
    || wrapper.memberKeyGeneration !== envelope.descriptor.memberKeyGeneration
    || wrapper.recipientKeyKind !== VAULT_KEY_KIND.vaultMessageX25519
    || wrapper.recipientKeyVersion !== envelope.descriptor.binding.recipientKeyVersion
    || wrapper.recipientFingerprint !== envelope.descriptor.binding.recipientKeyFingerprint) {
    throw new Error('Reason wrapper does not match its encrypted reason envelope')
  }
  const reasonExtension = {
    wrapperSuiteId: envelope.descriptor.binding.wrapperSuiteId,
    recipientKeyVersion: envelope.descriptor.binding.recipientKeyVersion,
    recipientKeyFingerprint: fromBase64Url(envelope.descriptor.binding.recipientKeyFingerprint),
    methods: envelope.descriptor.binding.requestedMethods,
  }
  const descriptorBytes = encodeCanonicalEnvelopeAad(toEnvelopeDescriptor(envelope.descriptor), reasonExtension)
  const expectedParentHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(descriptorBytes).buffer))
  const suppliedParentHash = wrapper.parentDescriptorHash ? fromBase64Url(wrapper.parentDescriptorHash) : new Uint8Array()
  if (expectedParentHash.length !== suppliedParentHash.length
    || expectedParentHash.some((value, index) => value !== suppliedParentHash[index])) {
    expectedParentHash.fill(0); suppliedParentHash.fill(0)
    throw new Error('Reason wrapper parent descriptor hash does not match')
  }
  expectedParentHash.fill(0); suppliedParentHash.fill(0)
  const privateDescriptor = toEnvelopeDescriptor(privateEnvelope.descriptor)
  const wrappingKey = await deriveVaultSubkey(vaultKey, {
    protocolVersion: privateDescriptor.protocolVersion, cryptoSuiteId: privateDescriptor.cryptoSuiteId,
    purpose: privateDescriptor.purpose, organizationId: privateDescriptor.organizationId,
    vaultId: privateDescriptor.vaultId, keyVersion: privateDescriptor.keyVersion,
    memberKeyGeneration: privateDescriptor.memberKeyGeneration,
  })
  let messagePrivateKey: Uint8Array | undefined
  let messagePublicKey: Uint8Array | undefined
  let reasonDek: Uint8Array | undefined
  try {
    messagePrivateKey = await openVaultEnvelope(privateEnvelope, wrappingKey, {
      wrappingVkVersion: privateEnvelope.descriptor.binding.wrappingVaultKeyVersion,
    })
    const sodium = await loadSodium()
    messagePublicKey = sodium.crypto_scalarmult_base(messagePrivateKey)
    reasonDek = await openKeyFromX25519Recipient(
      fromBase64Url(envelope.wrappedReasonDek.encodedSealedKeyPackage), messagePublicKey, messagePrivateKey,
      {
        protocolVersion: 2, wrapperSuiteId: X25519_SEALED_BOX_V1, purpose: WRAPPER_PURPOSE.reasonDek,
        organizationId: expected.organizationId, vaultId: expected.vaultId, entryId: expected.entryId,
        grantOrRequestId: expected.grantId, agentId: expected.agentId,
        resourceRevision: BigInt(wrapper.resourceRevision), wrappedKeyVersion: wrapper.wrappedKeyVersion,
        memberKeyGeneration: wrapper.memberKeyGeneration ?? undefined,
        recipientKeyKind: VAULT_KEY_KIND.vaultMessageX25519,
        recipientKeyVersion: wrapper.recipientKeyVersion,
        recipientFingerprint: fromBase64Url(wrapper.recipientFingerprint),
        parentDescriptorHash: wrapper.parentDescriptorHash ? fromBase64Url(wrapper.parentDescriptorHash) : undefined,
      },
    )
    const plaintext = await openVaultEnvelope(envelope, reasonDek, reasonExtension)
    try {
      if (plaintext.length === 0 || plaintext.length > 4096) throw new Error('Encrypted reason plaintext is out of bounds')
      return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
    } finally { wipe(plaintext) }
  } finally {
    wipe(wrappingKey)
    if (messagePrivateKey) wipe(messagePrivateKey)
    if (messagePublicKey) wipe(messagePublicKey)
    if (reasonDek) wipe(reasonDek)
  }
}
