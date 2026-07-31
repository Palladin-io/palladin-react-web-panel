import { encodeBase64Url, encodeUtf8 } from './vault-v2-bytes'
import { encryptVaultEnvelope } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import {
  createDiscoveryKeyEnvelope,
  createPrivateKeyEnvelope,
  generateRotationKeys,
  sealMemberVaultKey,
  vaultKeyFingerprint,
  type RotationDiscoveryKeyEnvelope,
  type RotationPrivateKeyEnvelope,
} from './vault-v2-rotation'
import { canonicalizeVaultJson, type CanonicalJson } from './vault-v2-signatures'
import { loadSodium, wipe } from './sodium'
import type {
  MemberVaultKeyEnvelope,
  MemberVaultMetadata,
  MemberVaultMetadataEnvelope,
} from './vault-v2-member-sync'

export interface InitialVaultMaterialInput {
  organizationId: string
  vaultId: string
  memberId: string
  memberKeyVersion: number
  memberPrivateKey: Uint8Array
  metadata: MemberVaultMetadata
}

export interface InitialVaultMaterial {
  vaultId: string
  memberVaultMetadata: MemberVaultMetadataEnvelope
  currentKeyEpoch: {
    vaultKeyVersion: number
    vdkVersion: number
    agentMessageKeyVersion: number
    manifestSigningKeyVersion: number
  }
  creatorVaultKey: MemberVaultKeyEnvelope
  discoveryKey: RotationDiscoveryKeyEnvelope
  vaultPrivateKeys: RotationPrivateKeyEnvelope[]
}

export async function createInitialVaultMaterial(
  input: InitialVaultMaterialInput,
): Promise<InitialVaultMaterial> {
  if (!Number.isInteger(input.memberKeyVersion) || input.memberKeyVersion < 1) {
    throw new Error('Current Member key version is required')
  }
  if (input.memberPrivateKey.length !== 32) {
    throw new Error('Member private key must be 32 bytes')
  }

  const keys = await generateRotationKeys()
  let memberPublicKey: Uint8Array | undefined
  let metadataPlaintext: Uint8Array | undefined
  let metadataKey: Uint8Array | undefined
  try {
    const sodium = await loadSodium()
    memberPublicKey = sodium.crypto_scalarmult_base(input.memberPrivateKey)
    metadataPlaintext = encodeUtf8(canonicalizeVaultJson(input.metadata as CanonicalJson))
    const scope = {
      organizationId: input.organizationId,
      vaultId: input.vaultId,
      vkVersion: 1,
      memberKeyGeneration: 1,
    }
    metadataKey = await deriveVaultProjectionKey({
      baseKey: keys.vaultKey,
      purpose: 'member-vault-metadata',
      resourceKind: 1,
      organizationId: input.organizationId,
      vaultId: input.vaultId,
      keyVersion: 1,
      memberKeyGeneration: 1,
    })
    const metadataContext = {
      organizationId: input.organizationId,
      vaultId: input.vaultId,
      metadataRevision: '1',
      header: {
        protocolVersion: 2,
        algorithmSuite: 1,
        resourceKind: 1,
        projectionKind: 1,
        resourceRevision: '1',
        keyVersion: 1,
        memberKeyGeneration: 1,
        nonce: '',
      },
    }
    const encryptedMetadata = await encryptVaultEnvelope(
      'member-vault-metadata',
      metadataContext,
      metadataPlaintext,
      metadataKey,
    )
    const recipientFingerprint = await vaultKeyFingerprint(memberPublicKey, 5)
    const creatorVaultKey = await sealMemberVaultKey({
      memberId: input.memberId,
      recipientKeyVersion: input.memberKeyVersion,
      recipientKeyFingerprint: recipientFingerprint,
      x25519PublicKey: encodeBase64Url(memberPublicKey),
    }, scope, keys.vaultKey)
    const discoveryKey = await createDiscoveryKeyEnvelope({
      organizationId: input.organizationId,
      vaultId: input.vaultId,
      discoveryKeyRevision: '0',
    }, keys.vdk, keys.vaultKey, {
      vdkVersion: 1,
      memberKeyGeneration: 1,
      vaultKeyVersion: 1,
    })
    const privateKeySource = (privateKeyKind: 1 | 2) => ({
      organizationId: input.organizationId,
      vaultId: input.vaultId,
      privateKeyKind,
      privateKeyRevision: '0',
    })
    const vaultPrivateKeys = await Promise.all([
      createPrivateKeyEnvelope(privateKeySource(1), keys.agentMessagePrivateKey, keys.vaultKey, {
        privateKeyVersion: 1,
        memberKeyGeneration: 1,
        vaultKeyVersion: 1,
      }),
      createPrivateKeyEnvelope(privateKeySource(2), keys.manifestSigningSeed, keys.vaultKey, {
        privateKeyVersion: 1,
        memberKeyGeneration: 1,
        vaultKeyVersion: 1,
      }),
    ])

    return {
      vaultId: input.vaultId,
      memberVaultMetadata: {
        ...metadataContext,
        header: { ...metadataContext.header, nonce: encryptedMetadata.nonce },
        ciphertext: encryptedMetadata.ciphertext,
      },
      currentKeyEpoch: {
        vaultKeyVersion: 1,
        vdkVersion: 1,
        agentMessageKeyVersion: 1,
        manifestSigningKeyVersion: 1,
      },
      creatorVaultKey,
      discoveryKey,
      vaultPrivateKeys,
    }
  } finally {
    wipe(keys.vaultKey)
    wipe(keys.vdk)
    wipe(keys.agentMessagePrivateKey)
    wipe(keys.manifestSigningSeed)
    if (memberPublicKey) wipe(memberPublicKey)
    if (metadataPlaintext) wipe(metadataPlaintext)
    if (metadataKey) wipe(metadataKey)
  }
}
