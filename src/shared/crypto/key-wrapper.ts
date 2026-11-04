import {
  computeRecipientFingerprint,
  deriveRecipientPublicKey,
  KEY_WRAPPER_PROTOCOL_VERSION,
  KEY_WRAPPER_PURPOSE,
  KEY_WRAPPER_SUITE,
  KeyWrapperError,
  openKey,
  RECIPIENT_KEY_KIND,
  sealingSuiteForRecipientKey,
  sealKey,
  sha256Digest,
  type KeyWrapperDescriptor,
} from '@palladin/crypto'
import { fromBase64, toBase64Url } from './encoding'
import { loadSodium, wipe } from './sodium'
import { concatBytes, encodeU16, encodeUtf8 } from './vault-v2-bytes'
import { signVaultObject, type CanonicalJson } from './vault-v2-signatures'

export { KEY_WRAPPER_PURPOSE, KEY_WRAPPER_SUITE, KeyWrapperError, RECIPIENT_KEY_KIND }

export const AGENT_WRAPPED_VAULT_KEY_SIGNATURE_DOMAIN = 'PLDNV2SIG:AGENT-WRAPPED-VAULT-KEY:'

/** Signing keys are outside the key-wrapper registry and keep the vault-v2 fingerprint. */
export const SIGNING_KEY_KIND = {
  agentSigning: 2,
  vaultSigning: 3,
  approverSigning: 7,
} as const

export type SigningKeyKind = (typeof SIGNING_KEY_KIND)[keyof typeof SIGNING_KEY_KIND]

export type KeyWrapperDescriptorContract = KeyWrapperDescriptor

export interface WrappedKeyContract {
  descriptor: KeyWrapperDescriptorContract
  encodedSealedKeyPackage: string
}

export interface MemberVaultKeyEnvelopeContract {
  wrappedVaultKey: WrappedKeyContract
}

export interface AgentWrappedVaultKeyContract {
  wrappedVaultKey: WrappedKeyContract
  vaultSigningKeyVersion: number
  vaultSigningKeyFingerprint: string
  producerSignature: string
}

/**
 * A recipient key exactly as its authenticated publication states it (key
 * directory, Agent record or signed manifest). The suite is the publication's,
 * never a value read from an envelope.
 */
export interface RecipientPublicKey {
  keySuiteId: string
  keyKind: number
  keyVersion: number
  publicKey: Uint8Array
}

/** This client's own decryption key; the suite comes from the authenticated account. */
export interface RecipientPrivateKey {
  keySuiteId: string
  privateKey: Uint8Array
}

export type WrapBinding = Pick<KeyWrapperDescriptor,
  'purpose' | 'scope' | 'resourceRevision' | 'wrappedKeyVersion' | 'memberKeyGeneration' | 'parentDescriptorHash'>

export function isKeyMigrationPending(error: unknown): boolean {
  return error instanceof KeyWrapperError && error.code === 'key-migration-pending'
}

export function recipientFingerprint(recipient: Omit<RecipientPublicKey, 'keyVersion'>): string {
  const fingerprint = computeRecipientFingerprint(recipient.keySuiteId, recipient.keyKind, recipient.publicKey)
  try {
    return toBase64Url(fingerprint)
  } finally {
    wipe(fingerprint)
  }
}

/** Seals a 32-byte key with the suite of the recipient's publication; inactive suites fail with `key-migration-pending`. */
export async function wrapKeyForRecipient(
  key: Uint8Array,
  recipient: RecipientPublicKey,
  binding: WrapBinding,
): Promise<WrappedKeyContract> {
  const wrapperSuiteId = sealingSuiteForRecipientKey(recipient.keySuiteId)
  const descriptor: KeyWrapperDescriptorContract = {
    protocolVersion: KEY_WRAPPER_PROTOCOL_VERSION,
    wrapperSuiteId,
    purpose: binding.purpose,
    scope: {
      organizationId: binding.scope.organizationId ?? null,
      vaultId: binding.scope.vaultId ?? null,
      entryId: binding.scope.entryId ?? null,
      grantOrRequestId: binding.scope.grantOrRequestId ?? null,
      agentId: binding.scope.agentId ?? null,
      memberId: binding.scope.memberId ?? null,
    },
    resourceRevision: binding.resourceRevision,
    wrappedKeyVersion: binding.wrappedKeyVersion,
    memberKeyGeneration: binding.memberKeyGeneration ?? null,
    recipientKeyKind: recipient.keyKind,
    recipientKeyVersion: recipient.keyVersion,
    recipientFingerprint: recipientFingerprint(recipient),
    parentDescriptorHash: binding.parentDescriptorHash ?? null,
  }
  return { descriptor, encodedSealedKeyPackage: await sealKey(descriptor, key, recipient) }
}

/**
 * Opens a package addressed to this client's own key. The fingerprint check
 * binds the package to the public key recomputed from `own.privateKey`.
 */
export async function unwrapKeyForRecipient(
  wrapped: WrappedKeyContract,
  own: RecipientPrivateKey,
  keyKind: number,
): Promise<Uint8Array> {
  const publicKey = await deriveRecipientPublicKey(own.keySuiteId, own.privateKey)
  try {
    return await openKey(wrapped.descriptor, wrapped.encodedSealedKeyPackage, {
      keySuiteId: own.keySuiteId,
      keyKind,
      keyVersion: wrapped.descriptor.recipientKeyVersion,
      publicKey,
      privateKey: own.privateKey,
    })
  } finally {
    wipe(publicKey)
  }
}

export async function derivePublicKeyFor(own: RecipientPrivateKey): Promise<Uint8Array> {
  return deriveRecipientPublicKey(own.keySuiteId, own.privateKey)
}

/** vault-v2 fingerprint of a 32-byte Ed25519 signing key. */
export function computeSigningKeyFingerprint(publicKey: Uint8Array, keyKind: SigningKeyKind): Uint8Array {
  if (publicKey.length !== 32) throw new RangeError('Signing public key must be 32 bytes')
  return sha256Digest(concatBytes(encodeUtf8('PLDNV2FP'), encodeU16(2), encodeU16(keyKind), publicKey))
}

async function normalizeVaultSigningKey(privateKey: Uint8Array) {
  if (privateKey.length !== 32 && privateKey.length !== 64) {
    throw new RangeError('Vault signing private key must be a 32-byte seed or 64-byte Ed25519 key')
  }
  const sodium = await loadSodium()
  const seed = new Uint8Array(privateKey.subarray(0, 32))
  try {
    const pair = sodium.crypto_sign_seed_keypair(seed)
    if (privateKey.length === 64 && !sodium.memcmp(pair.privateKey, privateKey)) {
      wipe(pair.publicKey)
      wipe(pair.privateKey)
      throw new Error('Vault signing private key is not canonical')
    }
    return { publicKey: new Uint8Array(pair.publicKey), privateKey: new Uint8Array(pair.privateKey) }
  } finally {
    wipe(seed)
  }
}

export async function buildAgentWrappedVaultKey(input: {
  vaultKey: Uint8Array
  organizationId: string
  vaultId: string
  grantId: string
  agentId: string
  agentAccessEpoch: number
  vaultKeyVersion: number
  recipientAgentKeyVersion: number
  agentPublicKey: string
  agentKeySuiteId: string
  vaultSigningKeyVersion: number
  vaultSigningPrivateKey: Uint8Array
}): Promise<AgentWrappedVaultKeyContract> {
  const publicKey = fromBase64(input.agentPublicKey)
  let signing: { publicKey: Uint8Array; privateKey: Uint8Array } | undefined
  let signingFingerprint: Uint8Array | undefined
  try {
    const wrappedVaultKey = await wrapKeyForRecipient(input.vaultKey, {
      keySuiteId: input.agentKeySuiteId,
      keyKind: RECIPIENT_KEY_KIND.agentEncryption,
      keyVersion: input.recipientAgentKeyVersion,
      publicKey,
    }, {
      purpose: KEY_WRAPPER_PURPOSE.agentVaultKey,
      scope: {
        organizationId: input.organizationId,
        vaultId: input.vaultId,
        entryId: null,
        grantOrRequestId: input.grantId,
        agentId: input.agentId,
        memberId: null,
      },
      resourceRevision: String(input.agentAccessEpoch),
      wrappedKeyVersion: input.vaultKeyVersion,
    })
    signing = await normalizeVaultSigningKey(input.vaultSigningPrivateKey)
    signingFingerprint = computeSigningKeyFingerprint(signing.publicKey, SIGNING_KEY_KIND.vaultSigning)
    const unsigned = {
      vaultSigningKeyFingerprint: toBase64Url(signingFingerprint),
      vaultSigningKeyVersion: input.vaultSigningKeyVersion,
      wrappedVaultKey,
    }
    const producerSignature = await signVaultObject(
      AGENT_WRAPPED_VAULT_KEY_SIGNATURE_DOMAIN,
      unsigned as unknown as CanonicalJson,
      signing.privateKey,
    )
    return { ...unsigned, producerSignature }
  } finally {
    wipe(publicKey)
    if (signing) { wipe(signing.publicKey); wipe(signing.privateKey) }
    if (signingFingerprint) wipe(signingFingerprint)
  }
}
