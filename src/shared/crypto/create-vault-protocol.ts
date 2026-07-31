import { VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { ENVELOPE_PURPOSE } from './envelope'
import { toBase64Url } from './encoding'
import { deriveVaultSubkey } from './hkdf'
import { loadSodium, wipe } from './sodium'
import { encodeMemberVaultMetadata, type MemberVaultMetadataV1 } from './vault-plaintext'
import { sealVaultEnvelope, type EnvelopeDescriptorContract, type VaultEnvelopeContract } from './vault-envelope'
import {
  computeVaultKeyFingerprint,
  sealKeyToX25519Recipient,
  VAULT_KEY_KIND,
  WRAPPER_PURPOSE,
  X25519_SEALED_BOX_V1,
  type MemberVaultKeyEnvelopeContract,
  type X25519WrapperContext,
} from './x25519-wrapper'

const PROTOCOL_VERSION = 2
const INITIAL_VERSION = 1

export interface CreateVaultProtocolInput {
  vaultId: string
  organizationId: string
  memberId: string
  memberKeyVersion: number
  memberPrivateKey: Uint8Array
  metadata: MemberVaultMetadataV1
}

export interface VaultPublicKeyContract {
  protocolVersion: number
  schemeId: 'palladin-x25519-v1' | 'palladin-ed25519-v1'
  keyKind: 1 | 2
  keyVersion: number
  encodedPublicKey: string
  fingerprint: string
}

export interface CreateVaultProtocolPayload {
  vaultId: string
  memberVaultMetadata: VaultEnvelopeContract<Record<string, never>>
  currentKeyEpoch: {
    vaultKeyVersion: number
    vdkVersion: number
    agentMessageKeyVersion: number
    manifestSigningKeyVersion: number
  }
  creatorVaultKey: MemberVaultKeyEnvelopeContract
  discoveryKey: VaultEnvelopeContract<{ wrappingVaultKeyVersion: number }>
  vaultPrivateKeys: VaultEnvelopeContract<{ wrappingVaultKeyVersion: number }>[]
  vaultAgentMessagePublicKey: VaultPublicKeyContract
  vaultManifestSigningPublicKey: VaultPublicKeyContract
}

function descriptor<TBinding>(
  input: CreateVaultProtocolInput,
  purpose: number,
  keyVersion: number,
  binding: TBinding,
): EnvelopeDescriptorContract<TBinding> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
    purpose: purpose as EnvelopeDescriptorContract<TBinding>['purpose'],
    scope: { organizationId: input.organizationId, vaultId: input.vaultId },
    resourceRevision: '1',
    keyVersion,
    memberKeyGeneration: INITIAL_VERSION,
    binding,
  }
}

async function sealWithVaultSubkey<TBinding>(
  rootKey: Uint8Array,
  envelopeDescriptor: EnvelopeDescriptorContract<TBinding>,
  plaintext: Uint8Array,
): Promise<VaultEnvelopeContract<TBinding>> {
  const key = await deriveVaultSubkey(rootKey, {
    protocolVersion: envelopeDescriptor.protocolVersion,
    cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
    purpose: envelopeDescriptor.purpose,
    organizationId: envelopeDescriptor.scope.organizationId,
    vaultId: envelopeDescriptor.scope.vaultId,
    keyVersion: envelopeDescriptor.keyVersion,
    memberKeyGeneration: envelopeDescriptor.memberKeyGeneration ?? undefined,
  })
  try {
    return await sealVaultEnvelope(envelopeDescriptor, plaintext, key,
      envelopeDescriptor.binding && 'wrappingVaultKeyVersion' in (envelopeDescriptor.binding as object)
        ? { wrappingVkVersion: (envelopeDescriptor.binding as unknown as { wrappingVaultKeyVersion: number }).wrappingVaultKeyVersion }
        : undefined)
  } finally {
    wipe(key)
  }
}

export async function createVaultProtocolPayload(
  input: CreateVaultProtocolInput,
): Promise<CreateVaultProtocolPayload> {
  if (!Number.isInteger(input.memberKeyVersion) || input.memberKeyVersion <= 0) {
    throw new RangeError('Member key version must be positive')
  }
  const sodium = await loadSodium()
  const vaultKey = sodium.randombytes_buf(32)
  const discoveryKey = sodium.randombytes_buf(32)
  const memberPublicKey = sodium.crypto_scalarmult_base(input.memberPrivateKey)
  const agentMessage = sodium.crypto_box_keypair()
  const manifestSigning = sodium.crypto_sign_keypair()
  const metadataPlaintext = encodeMemberVaultMetadata(input.metadata)
  try {
    const recipientFingerprint = await computeVaultKeyFingerprint(memberPublicKey, VAULT_KEY_KIND.memberX25519)
    const wrapperContext: X25519WrapperContext = {
      protocolVersion: PROTOCOL_VERSION,
      wrapperSuiteId: X25519_SEALED_BOX_V1,
      purpose: WRAPPER_PURPOSE.memberVaultKey,
      organizationId: input.organizationId,
      vaultId: input.vaultId,
      memberId: input.memberId,
      resourceRevision: INITIAL_VERSION,
      wrappedKeyVersion: INITIAL_VERSION,
      memberKeyGeneration: INITIAL_VERSION,
      recipientKeyKind: VAULT_KEY_KIND.memberX25519,
      recipientKeyVersion: input.memberKeyVersion,
      recipientFingerprint,
    }
    const sealedVaultKey = await sealKeyToX25519Recipient(vaultKey, memberPublicKey, wrapperContext)
    const wrapping = { wrappingVaultKeyVersion: INITIAL_VERSION }
    const [memberVaultMetadata, encryptedDiscoveryKey, encryptedAgentPrivate, encryptedSigningPrivate] = await Promise.all([
      sealWithVaultSubkey(vaultKey, descriptor(input, ENVELOPE_PURPOSE.memberVaultMetadata, INITIAL_VERSION, {}), metadataPlaintext),
      sealWithVaultSubkey(vaultKey, descriptor(input, ENVELOPE_PURPOSE.vaultDiscoveryKeyByVk, INITIAL_VERSION, wrapping), discoveryKey),
      sealWithVaultSubkey(vaultKey, descriptor(input, ENVELOPE_PURPOSE.agentMessagePrivateByVk, INITIAL_VERSION, wrapping), agentMessage.privateKey),
      sealWithVaultSubkey(vaultKey, descriptor(input, ENVELOPE_PURPOSE.manifestPrivateByVk, INITIAL_VERSION, wrapping), manifestSigning.privateKey),
    ])
    const [agentFingerprint, signingFingerprint] = await Promise.all([
      computeVaultKeyFingerprint(agentMessage.publicKey, VAULT_KEY_KIND.vaultMessageX25519),
      computeVaultKeyFingerprint(manifestSigning.publicKey, VAULT_KEY_KIND.vaultSigningEd25519),
    ])
    return {
      vaultId: input.vaultId,
      memberVaultMetadata,
      currentKeyEpoch: { vaultKeyVersion: 1, vdkVersion: 1, agentMessageKeyVersion: 1, manifestSigningKeyVersion: 1 },
      creatorVaultKey: {
        wrappedVaultKey: {
          descriptor: {
            protocolVersion: PROTOCOL_VERSION,
            wrapperSuiteId: X25519_SEALED_BOX_V1,
            purpose: WRAPPER_PURPOSE.memberVaultKey,
            scope: { organizationId: input.organizationId, vaultId: input.vaultId, memberId: input.memberId },
            resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1,
            recipientKeyKind: VAULT_KEY_KIND.memberX25519,
            recipientKeyVersion: input.memberKeyVersion,
            recipientFingerprint: toBase64Url(recipientFingerprint), parentDescriptorHash: null,
          },
          encodedSealedKeyPackage: toBase64Url(sealedVaultKey),
        },
      },
      discoveryKey: encryptedDiscoveryKey,
      vaultPrivateKeys: [encryptedAgentPrivate, encryptedSigningPrivate],
      vaultAgentMessagePublicKey: {
        protocolVersion: 2, schemeId: 'palladin-x25519-v1', keyKind: 1, keyVersion: 1,
        encodedPublicKey: toBase64Url(agentMessage.publicKey), fingerprint: toBase64Url(agentFingerprint),
      },
      vaultManifestSigningPublicKey: {
        protocolVersion: 2, schemeId: 'palladin-ed25519-v1', keyKind: 2, keyVersion: 1,
        encodedPublicKey: toBase64Url(manifestSigning.publicKey), fingerprint: toBase64Url(signingFingerprint),
      },
    }
  } finally {
    wipe(vaultKey); wipe(discoveryKey); wipe(memberPublicKey)
    // libsodium returns realm-owned views for keypair secrets; overwrite those
    // exact backing stores instead of passing them back through the wrapper.
    agentMessage.privateKey.fill(0); manifestSigning.privateKey.fill(0)
    metadataPlaintext.fill(0)
  }
}
