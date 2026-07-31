import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeBase64Url, decodeHex, encodeHex, encodeUtf8 } from './vault-v2-bytes'
import { decryptVaultEnvelope, openVaultProtocolPackage, type VaultCiphertextEnvelope, type VaultEnvelopeExpectations } from './vault-v2-envelope'
import { deriveVaultProjectionKey, type VaultKdfPurpose } from './vault-v2-kdf'
import { encodeVaultAad, type VaultAadContext, type VaultAadProfile } from './vault-v2-protocol'
import { canonicalizeVaultJson, verifyVaultSignature, vaultSignatureInput } from './vault-v2-signatures'
import { loadSodium } from './sodium'

const PINNED_PROTOCOL_COMMIT = '856872168ff251e5e9e782e3403c1339586ab190'
const PINNED_MANIFEST_SHA256 = 'a933b61b8bb1a0f966f51fbe51a9c5baa9c09353e2a9131ba7414a559bc4adaf'
const fixtureRoot = resolve(process.cwd(), 'src/shared/crypto/fixtures/vault-v2')

function fixture<T>(root: string, relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8')) as T
}

interface AadVector { id: string; profile: VaultAadProfile; aadHex: string; fields: unknown[] }
interface HkdfVector {
  purpose: VaultKdfPurpose; purposeId: number; baseKeyHex: string; resourceKind: 'vault' | 'entry'
  organizationId: string; vaultId: string; entryId: string | null; keyVersion: number; memberKeyGeneration: number; outputHex: string
}
interface AeadVector { id: string; aadProfile: VaultAadProfile; plaintextHex: string; decryptionKeyHex: string; envelope: VaultCiphertextEnvelope }
interface SealedVector {
  id: string; plaintextCanonical: string; recipientPublicKeyHex: string; recipientPrivateKeyHex: string
  envelope: Record<string, unknown> & { sealedVaultKeyPackage?: string; agentWrappedVdk?: string }
}
interface SignatureVector {
  id: string; domainPrefixAscii: string; publicKeyHex: string; signatureHex: string; signatureInputHex: string
  canonicalUnsignedObject: string; unsignedObject: Parameters<typeof canonicalizeVaultJson>[0]; signedObject: Record<string, unknown> & { signature?: string; agentSignature?: string }
}

const aad = fixture<{ vectors: AadVector[] }>(fixtureRoot, 'vectors/aad.json')
const keyDerivation = fixture<{ hkdfVectors: HkdfVector[] }>(fixtureRoot, 'vectors/key-derivation.json')
const envelopes = fixture<{ aeadVectors: AeadVector[]; sealedBoxVectors: SealedVector[] }>(fixtureRoot, 'vectors/envelopes.json')
const rotation = fixture<{ pendingAeadVectors: AeadVector[]; pendingSealedBoxVectors: SealedVector[] }>(fixtureRoot, 'vectors/rotation.json')
const signatures = fixture<{ vectors: SignatureVector[] }>(fixtureRoot, 'vectors/signatures.json')
const negatives = fixture<{ cases: Array<Record<string, unknown> & { id: string; sourceVector: string }> }>(fixtureRoot, 'negative/corruption.json')

const profileByVector = new Map(envelopes.aeadVectors.map((vector) => [vector.id, vector.aadProfile]))
const keyByVector = new Map(envelopes.aeadVectors.map((vector) => [vector.id, vector.decryptionKeyHex]))
const envelopeByVector = new Map(envelopes.aeadVectors.map((vector) => [vector.id, vector.envelope]))

function expectations(envelope: VaultCiphertextEnvelope): VaultEnvelopeExpectations {
  return {
    aadContext: envelope,
    minimumMemberKeyGeneration: envelope.header.memberKeyGeneration,
  }
}

describe('canonical Vault protocol 2 fixtures', () => {
  it('records the source revision for the vendored fixture set', () => {
    expect(PINNED_PROTOCOL_COMMIT).toMatch(/^[0-9a-f]{40}$/)
  })

  it('pins the authoritative protocol fixture manifest', async () => {
    const manifest = readFileSync(join(fixtureRoot, 'manifest.json'))
    const digest = await crypto.subtle.digest('SHA-256', manifest)
    expect(encodeHex(new Uint8Array(digest))).toBe(PINNED_MANIFEST_SHA256)
  })

  it.each(aad.vectors)('encodes $id AAD byte-for-byte', (vector) => {
    const envelope = envelopes.aeadVectors.find((candidate) => candidate.id === vector.id)?.envelope
    expect(envelope).toBeDefined()
    expect(encodeHex(encodeVaultAad(vector.profile, envelope as VaultAadContext))).toBe(vector.aadHex)
  })

  it.each(keyDerivation.hkdfVectors)('derives $purpose projection key byte-for-byte', async (vector) => {
    const derived = await deriveVaultProjectionKey({
      baseKey: decodeHex(vector.baseKeyHex), purpose: vector.purpose,
      resourceKind: vector.resourceKind === 'vault' ? 1 : 2,
      organizationId: vector.organizationId, vaultId: vector.vaultId,
      entryId: vector.entryId ?? undefined, keyVersion: vector.keyVersion,
      memberKeyGeneration: vector.memberKeyGeneration,
    })
    expect(encodeHex(derived)).toBe(vector.outputHex)
  })

  it.each(envelopes.aeadVectors)('decrypts authenticated $id envelope', async (vector) => {
    const plaintext = await decryptVaultEnvelope(vector.aadProfile, vector.envelope, decodeHex(vector.decryptionKeyHex), expectations(vector.envelope))
    expect(encodeHex(plaintext)).toBe(vector.plaintextHex)
  })

  it.each(rotation.pendingAeadVectors)('decrypts canonical pending $id rotation envelope', async (vector) => {
    const plaintext = await decryptVaultEnvelope(vector.aadProfile, vector.envelope, decodeHex(vector.decryptionKeyHex), expectations(vector.envelope))
    expect(encodeHex(plaintext)).toBe(vector.plaintextHex)
  })

  it.each(rotation.pendingSealedBoxVectors)('opens canonical pending $id rotation package', async (vector) => {
    const ciphertext = vector.envelope.sealedVaultKeyPackage ?? vector.envelope.agentWrappedVdk
    const plaintext = await openVaultProtocolPackage(
      decodeBase64Url(ciphertext!), decodeHex(vector.recipientPublicKeyHex), decodeHex(vector.recipientPrivateKeyHex),
    )
    expect(new TextDecoder().decode(plaintext)).toBe(vector.plaintextCanonical)
  })

  it.each(envelopes.sealedBoxVectors)('opens $id sealed package', async (vector) => {
    const ciphertext = vector.envelope.sealedVaultKeyPackage ?? vector.envelope.agentWrappedVdk
    const plaintext = await openVaultProtocolPackage(
      decodeBase64Url(ciphertext!), decodeHex(vector.recipientPublicKeyHex), decodeHex(vector.recipientPrivateKeyHex),
    )
    expect(new TextDecoder().decode(plaintext)).toBe(vector.plaintextCanonical)
  })

  it.each(signatures.vectors)('verifies canonical $id signature', async (vector) => {
    expect(canonicalizeVaultJson(vector.unsignedObject)).toBe(vector.canonicalUnsignedObject)
    expect(encodeHex(vaultSignatureInput(vector.domainPrefixAscii, vector.unsignedObject))).toBe(vector.signatureInputHex)
    const signature = vector.signedObject.signature ?? vector.signedObject.agentSignature
    expect(await verifyVaultSignature(vector.domainPrefixAscii, vector.unsignedObject, signature!, decodeHex(vector.publicKeyHex))).toBe(true)
  })

  it.each(negatives.cases.filter((testCase) => testCase.id !== 'invalid-vault-manifest-signature' && testCase.id !== 'sealed-box-wrong-recipient'))('rejects $id', async (testCase) => {
    const profile = profileByVector.get(testCase.targetVector as string) ?? profileByVector.get(testCase.sourceVector)
    const keyHex = testCase.decryptionKeyHex as string | undefined ?? keyByVector.get(testCase.sourceVector)
    const expectedVector = envelopeByVector.get(testCase.targetVector as string) ?? envelopeByVector.get(testCase.sourceVector)
    await expect(decryptVaultEnvelope(profile!, testCase.envelope as VaultCiphertextEnvelope, decodeHex(keyHex!), expectations(expectedVector!))).rejects.toThrow()
  })

  it('rejects an invalid signed manifest', async () => {
    const testCase = negatives.cases.find((candidate) => candidate.id === 'invalid-vault-manifest-signature')!
    const source = signatures.vectors.find((vector) => vector.id === testCase.sourceVector)!
    const signed = testCase.signedObject as Record<string, unknown> & { signature: string }
    const { signature, ...unsigned } = signed
    expect(await verifyVaultSignature(source.domainPrefixAscii, unsigned as SignatureVector['unsignedObject'], signature, decodeHex(source.publicKeyHex))).toBe(false)
  })

  it('rejects a sealed package opened by the wrong recipient', async () => {
    const testCase = negatives.cases.find((candidate) => candidate.id === 'sealed-box-wrong-recipient')!
    const sodium = await loadSodium()
    const wrongRecipient = sodium.crypto_box_seed_keypair(decodeHex(testCase.recipientSeedHex as string))
    const envelope = testCase.envelope as { agentWrappedVdk: string }
    await expect(openVaultProtocolPackage(decodeBase64Url(envelope.agentWrappedVdk), wrongRecipient.publicKey, wrongRecipient.privateKey)).rejects.toThrow()
  })

  it('fails closed on unsupported protocol, suite, and stale generation before decryption', async () => {
    const vector = envelopes.aeadVectors[0]
    for (const headerPatch of [{ protocolVersion: 1 }, { algorithmSuite: 99 }]) {
      const changed = { ...vector.envelope, header: { ...vector.envelope.header, ...headerPatch } }
      await expect(decryptVaultEnvelope(vector.aadProfile, changed, decodeHex(vector.decryptionKeyHex), expectations(vector.envelope))).rejects.toThrow()
    }
    await expect(decryptVaultEnvelope(vector.aadProfile, vector.envelope, decodeHex(vector.decryptionKeyHex), { ...expectations(vector.envelope), minimumMemberKeyGeneration: vector.envelope.header.memberKeyGeneration + 1 })).rejects.toThrow('stale')
  })

  it('rejects oversized ciphertext before cryptographic processing', async () => {
    const vector = envelopes.aeadVectors.find((candidate) => candidate.id === 'encrypted-reason')!
    const oversized = { ...vector.envelope, ciphertext: 'A'.repeat(5_500) }
    await expect(decryptVaultEnvelope(vector.aadProfile, oversized, decodeHex(vector.decryptionKeyHex), expectations(vector.envelope))).rejects.toThrow('limit')
  })

  it('rejects sealed packages outside the protocol size bounds before opening', async () => {
    const sodium = await loadSodium()
    const recipient = sodium.crypto_box_keypair()
    await expect(openVaultProtocolPackage(new Uint8Array(sodium.crypto_box_SEALBYTES), recipient.publicKey, recipient.privateKey)).rejects.toThrow('limit')
    await expect(openVaultProtocolPackage(new Uint8Array(4_096 + sodium.crypto_box_SEALBYTES + 1), recipient.publicKey, recipient.privateKey)).rejects.toThrow('limit')
  })

  it('rejects profile-specific identity substitution even when generic versions match', async () => {
    const vector = envelopes.aeadVectors.find((candidate) => candidate.id === 'grant-entry')!
    const substituted = { ...vector.envelope, grantId: '77777777-7777-4777-8777-777777777777' }
    await expect(decryptVaultEnvelope(vector.aadProfile, substituted, decodeHex(vector.decryptionKeyHex), expectations(vector.envelope))).rejects.toThrow('context mismatch')
  })

  it('rejects non-scalar Unicode while preserving valid surrogate pairs', () => {
    expect(() => encodeUtf8(String.fromCharCode(0xd800))).toThrow('surrogate')
    expect(() => canonicalizeVaultJson({ value: String.fromCharCode(0xd800) })).toThrow('surrogate')
    expect(() => canonicalizeVaultJson({ value: String.fromCharCode(0xdc00) })).toThrow('surrogate')
    expect(canonicalizeVaultJson({ value: '🔐' })).toBe('{"value":"🔐"}')
  })
})
