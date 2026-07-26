import { decodeBase64Url, encodeBase64Url } from './vault-v2-bytes'
import { loadSodium, wipe } from './sodium'
import { assertEnvelopeBindings, assertMinimumGeneration, encodeVaultAad, type VaultAadContext, type VaultAadProfile } from './vault-v2-protocol'

export interface VaultCiphertextEnvelope extends VaultAadContext {
  header: VaultAadContext['header']
  ciphertext?: string
  wrappedEntryDekByVk?: string
}

export interface VaultEnvelopeExpectations {
  aadContext: VaultAadContext
  minimumMemberKeyGeneration: number
}

const MAXIMUM_SEALED_PACKAGE_PLAINTEXT_BYTES = 4_096

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

function ciphertextOf(envelope: VaultCiphertextEnvelope): string {
  const ciphertext = envelope.ciphertext ?? envelope.wrappedEntryDekByVk
  if (!ciphertext) throw new Error('missing Vault ciphertext')
  return ciphertext
}

const maximumCiphertextBytes: Record<VaultAadProfile, number> = {
  'member-vault-metadata': 16_384,
  'member-index': 32_768,
  'member-secret': 262_144,
  'agent-discovery': 16_384,
  'entry-key-wrapper': 48,
  'vault-private-key': 4_096,
  'vault-discovery-key': 256,
  'encrypted-reason': 4_096,
  'grant-payload': 262_144,
}

export async function decryptVaultEnvelope(
  profile: VaultAadProfile,
  envelope: VaultCiphertextEnvelope,
  key: Uint8Array,
  expected: VaultEnvelopeExpectations,
): Promise<Uint8Array> {
  if (key.length !== 32) throw new Error('Vault envelope key must be 32 bytes')
  assertEnvelopeBindings(profile, envelope)
  assertEnvelopeBindings(profile, expected.aadContext)
  const aad = encodeVaultAad(profile, envelope)
  const expectedAad = encodeVaultAad(profile, expected.aadContext)
  if (!bytesEqual(aad, expectedAad)) throw new Error('Vault envelope authenticated context mismatch')
  assertMinimumGeneration(envelope.header.memberKeyGeneration, expected.minimumMemberKeyGeneration)
  const nonce = decodeBase64Url(envelope.header.nonce)
  if (nonce.length !== 24) throw new Error('Vault envelope nonce must be 24 bytes')
  const ciphertext = decodeBase64Url(ciphertextOf(envelope), maximumCiphertextBytes[profile])
  const sodium = await loadSodium()
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, aad, nonce, key)
}

export async function encryptVaultEnvelope(
  profile: VaultAadProfile,
  context: VaultAadContext,
  plaintext: Uint8Array,
  key: Uint8Array,
): Promise<{ nonce: string; ciphertext: string }> {
  if (key.length !== 32) throw new Error('Vault envelope key must be 32 bytes')
  if (plaintext.length + 16 > maximumCiphertextBytes[profile]) throw new Error('Vault plaintext exceeds envelope limit')
  assertEnvelopeBindings(profile, context)
  const aad = encodeVaultAad(profile, context)
  const sodium = await loadSodium()
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  try {
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, aad, null, nonce, key)
    return { nonce: encodeBase64Url(nonce), ciphertext: encodeBase64Url(ciphertext) }
  } finally {
    wipe(nonce)
  }
}

export async function sealVaultProtocolPackage(packageBytes: Uint8Array, recipientPublicKey: Uint8Array): Promise<Uint8Array> {
  if (packageBytes.length === 0 || packageBytes.length > MAXIMUM_SEALED_PACKAGE_PLAINTEXT_BYTES || recipientPublicKey.length !== 32) throw new Error('invalid Vault package or recipient key length')
  const sodium = await loadSodium()
  // Normalize cross-realm typed arrays (e.g. Web Worker/jsdom boundaries)
  // through libsodium before handling plaintext key packages.
  const plaintext = sodium.from_base64(encodeBase64Url(packageBytes), sodium.base64_variants.URLSAFE_NO_PADDING)
  const publicKey = sodium.from_base64(encodeBase64Url(recipientPublicKey), sodium.base64_variants.URLSAFE_NO_PADDING)
  try {
    return sodium.crypto_box_seal(plaintext, publicKey)
  } finally {
    wipe(plaintext)
  }
}

export async function openVaultProtocolPackage(ciphertext: Uint8Array, recipientPublicKey: Uint8Array, recipientPrivateKey: Uint8Array): Promise<Uint8Array> {
  if (recipientPublicKey.length !== 32 || recipientPrivateKey.length !== 32) throw new Error('invalid recipient key length')
  const sodium = await loadSodium()
  if (ciphertext.length <= sodium.crypto_box_SEALBYTES || ciphertext.length > MAXIMUM_SEALED_PACKAGE_PLAINTEXT_BYTES + sodium.crypto_box_SEALBYTES) {
    throw new Error('sealed Vault package exceeds protocol limits')
  }
  return sodium.crypto_box_seal_open(ciphertext, recipientPublicKey, recipientPrivateKey)
}
