import type { MemberVaultMetadataV1 } from './vault-plaintext'
import { parseMemberVaultMetadata } from './vault-plaintext'
import type { VaultEnvelopeContract } from './vault-envelope'
import { assertEnvelopeScope, openVaultEnvelope, sealVaultEnvelope, toEnvelopeDescriptor } from './vault-envelope'
import { deriveVaultSubkey } from './hkdf'
import { ENVELOPE_PURPOSE } from './envelope'
import { VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { encodeMemberVaultMetadata } from './vault-plaintext'
import { wipe } from './sodium'
import {
  derivePublicKeyFor,
  KEY_WRAPPER_PURPOSE,
  RECIPIENT_KEY_KIND,
  unwrapKeyForRecipient,
  wrapKeyForRecipient,
  type MemberVaultKeyEnvelopeContract,
  type RecipientPrivateKey,
} from './key-wrapper'

export interface EmptyEnvelopeBindingContract { readonly __empty?: never }

export type MemberVaultMetadataEnvelopeContract = VaultEnvelopeContract<EmptyEnvelopeBindingContract>

export interface EncryptedVaultProjection {
  id: string
  organizationId: string
  memberKeyGeneration: number
  memberVaultMetadata: MemberVaultMetadataEnvelopeContract
  memberVaultKey: MemberVaultKeyEnvelopeContract
}

export async function sealMemberVaultMetadata(
  outer: Pick<EncryptedVaultProjection, 'id' | 'organizationId' | 'memberKeyGeneration'>,
  current: MemberVaultMetadataEnvelopeContract,
  metadata: MemberVaultMetadataV1,
  vaultKey: Uint8Array,
): Promise<MemberVaultMetadataEnvelopeContract> {
  assertEnvelopeScope(current.descriptor, {
    purpose: ENVELOPE_PURPOSE.memberVaultMetadata,
    organizationId: outer.organizationId,
    vaultId: outer.id,
  })
  if (current.descriptor.memberKeyGeneration !== outer.memberKeyGeneration) {
    throw new Error('Vault metadata generation does not match the outer Vault')
  }
  const revision = BigInt(current.descriptor.resourceRevision) + 1n
  const descriptor = {
    protocolVersion: 2,
    cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
    purpose: ENVELOPE_PURPOSE.memberVaultMetadata,
    scope: { organizationId: outer.organizationId, vaultId: outer.id },
    resourceRevision: revision.toString(),
    keyVersion: current.descriptor.keyVersion,
    memberKeyGeneration: outer.memberKeyGeneration,
    binding: {},
  } satisfies MemberVaultMetadataEnvelopeContract['descriptor']
  const key = await deriveVaultSubkey(vaultKey, {
    protocolVersion: 2, cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
    purpose: descriptor.purpose, organizationId: outer.organizationId, vaultId: outer.id,
    keyVersion: descriptor.keyVersion, memberKeyGeneration: outer.memberKeyGeneration,
  })
  const plaintext = encodeMemberVaultMetadata(metadata)
  try { return await sealVaultEnvelope(descriptor, plaintext, key) }
  finally { wipe(key); plaintext.fill(0) }
}

export interface OpenVaultProjectionResult {
  metadata: MemberVaultMetadataV1
  vaultKey: Uint8Array
}

/**
 * Frozen Member-VK rule: both wrapper resource revision and wrapped-key
 * version equal `vkVersion`; the package is scoped to org/vault/member.
 */
export async function openMemberVaultKey(
  envelope: MemberVaultKeyEnvelopeContract,
  memberKey: RecipientPrivateKey,
): Promise<Uint8Array> {
  const descriptor = envelope.wrappedVaultKey.descriptor
  if (descriptor.purpose !== KEY_WRAPPER_PURPOSE.memberVaultKey
    || descriptor.recipientKeyKind !== RECIPIENT_KEY_KIND.memberEncryption
    || descriptor.scope.memberId == null
    || descriptor.memberKeyGeneration == null
    || descriptor.resourceRevision !== String(descriptor.wrappedKeyVersion)) {
    throw new TypeError('Invalid Member Vault-key wrapper descriptor')
  }
  return unwrapKeyForRecipient(envelope.wrappedVaultKey, memberKey, RECIPIENT_KEY_KIND.memberEncryption)
}

export async function openVaultDerivedEnvelope<TBinding extends { wrappingVaultKeyVersion: number }>(
  envelope: VaultEnvelopeContract<TBinding>,
  vaultKey: Uint8Array,
): Promise<Uint8Array> {
  const descriptor = toEnvelopeDescriptor(envelope.descriptor)
  const key = await deriveVaultSubkey(vaultKey, {
    protocolVersion: descriptor.protocolVersion, cryptoSuiteId: descriptor.cryptoSuiteId,
    purpose: descriptor.purpose, organizationId: descriptor.organizationId, vaultId: descriptor.vaultId,
    keyVersion: descriptor.keyVersion, memberKeyGeneration: descriptor.memberKeyGeneration,
  })
  try {
    return await openVaultEnvelope(envelope, key, {
      wrappingVkVersion: envelope.descriptor.binding.wrappingVaultKeyVersion,
    })
  } finally { wipe(key) }
}

export async function openVaultProjection(
  vault: EncryptedVaultProjection,
  memberKey: RecipientPrivateKey,
  memberId: string,
): Promise<OpenVaultProjectionResult> {
  const wrapper = vault.memberVaultKey.wrappedVaultKey
  if (wrapper.descriptor.scope.organizationId !== vault.organizationId
    || wrapper.descriptor.scope.vaultId !== vault.id
    || wrapper.descriptor.scope.memberId !== memberId
    || wrapper.descriptor.memberKeyGeneration !== vault.memberKeyGeneration) {
    throw new Error('Member Vault-key envelope does not match the outer Vault')
  }

  const vaultKey = await openMemberVaultKey(vault.memberVaultKey, memberKey)
  try {
    assertEnvelopeScope(vault.memberVaultMetadata.descriptor, {
      purpose: ENVELOPE_PURPOSE.memberVaultMetadata,
      organizationId: vault.organizationId,
      vaultId: vault.id,
    })
    if (vault.memberVaultMetadata.descriptor.memberKeyGeneration !== vault.memberKeyGeneration) {
      throw new Error('Vault metadata generation does not match the outer Vault')
    }
    const descriptor = toEnvelopeDescriptor(vault.memberVaultMetadata.descriptor)
    const metadataKey = await deriveVaultSubkey(vaultKey, {
      protocolVersion: descriptor.protocolVersion,
      cryptoSuiteId: descriptor.cryptoSuiteId,
      purpose: descriptor.purpose,
      organizationId: descriptor.organizationId,
      vaultId: descriptor.vaultId,
      keyVersion: descriptor.keyVersion,
      memberKeyGeneration: descriptor.memberKeyGeneration,
    })
    try {
      const plaintext = await openVaultEnvelope(vault.memberVaultMetadata, metadataKey)
      try {
        return { metadata: parseMemberVaultMetadata(plaintext), vaultKey }
      } finally {
        wipe(plaintext)
      }
    } finally {
      wipe(metadataKey)
    }
  } catch (error) {
    wipe(vaultKey)
    throw error
  }
}

/**
 * Security upgrade: re-wraps this member's current VK from the legacy Member
 * key to the new one. Every binding except the recipient is copied from the
 * opened envelope, whose scope `openMemberVaultKey` already checked against
 * the outer Vault and the session principal.
 */
export async function rewrapOwnMemberVaultKey(input: {
  vault: Pick<EncryptedVaultProjection, 'id' | 'organizationId' | 'memberKeyGeneration' | 'memberVaultKey'>
  memberId: string
  legacyKey: RecipientPrivateKey
  nextKey: RecipientPrivateKey & { keyVersion: number }
}): Promise<MemberVaultKeyEnvelopeContract> {
  const descriptor = input.vault.memberVaultKey.wrappedVaultKey.descriptor
  if (descriptor.scope.organizationId !== input.vault.organizationId
    || descriptor.scope.vaultId !== input.vault.id
    || descriptor.scope.memberId !== input.memberId
    || descriptor.memberKeyGeneration !== input.vault.memberKeyGeneration) {
    throw new Error('Member Vault-key envelope does not match the outer Vault')
  }
  const vaultKey = await openMemberVaultKey(input.vault.memberVaultKey, input.legacyKey)
  const publicKey = await derivePublicKeyFor(input.nextKey)
  try {
    const wrappedVaultKey = await wrapKeyForRecipient(vaultKey, {
      keySuiteId: input.nextKey.keySuiteId,
      keyKind: RECIPIENT_KEY_KIND.memberEncryption,
      keyVersion: input.nextKey.keyVersion,
      publicKey,
    }, {
      purpose: KEY_WRAPPER_PURPOSE.memberVaultKey,
      scope: { organizationId: input.vault.organizationId, vaultId: input.vault.id, memberId: input.memberId },
      resourceRevision: descriptor.resourceRevision,
      wrappedKeyVersion: descriptor.wrappedKeyVersion,
      memberKeyGeneration: descriptor.memberKeyGeneration,
    })
    return { wrappedVaultKey }
  } finally {
    wipe(vaultKey)
    wipe(publicKey)
  }
}
