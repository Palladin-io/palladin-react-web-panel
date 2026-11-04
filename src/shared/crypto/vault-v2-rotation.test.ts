import { generateRecipientKeyPair, KEY_WRAPPER_SUITE, openKey, RECIPIENT_KEY_KIND } from '@palladin/crypto'
import { describe, expect, it } from 'vitest'
import { toBase64 } from './encoding'
import { decodeBase64Url, encodeBase64Url } from './vault-v2-bytes'
import { decryptVaultEnvelope, encryptVaultEnvelope } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import { decryptMemberVaultMetadata } from './vault-v2-member-sync'
import { createAgentDiscoveryMaterial, rewrapEntryKey, rotateVaultMetadata, vaultKeyFingerprint } from './vault-v2-rotation'
import { canonicalizeVaultJson, verifyVaultSignature } from './vault-v2-signatures'
import { loadSodium, randomBytes, wipe } from './sodium'

const organizationId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'
const entryId = '33333333-3333-4333-8333-333333333333'
const agentId = '44444444-4444-4444-8444-444444444444'

describe('Vault rotation crypto', () => {
  it('rotates MemberVaultMetadata between HKDF-isolated Vault generations', async () => {
    const sodium = await loadSodium()
    const currentVk = await randomBytes(32)
    const targetVk = await randomBytes(32)
    const currentKey = await deriveVaultProjectionKey({ baseKey: currentVk, purpose: 'member-vault-metadata',
      resourceKind: 1, organizationId, vaultId, keyVersion: 2, memberKeyGeneration: 4 })
    try {
      const context = { organizationId, vaultId, metadataRevision: '9',
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 1, projectionKind: 1,
          resourceRevision: '9', keyVersion: 2, memberKeyGeneration: 4, nonce: '' } }
      const metadata = sodium.from_string(canonicalizeVaultJson({ name: 'Primary', color: 'red' }))
      const encrypted = await encryptVaultEnvelope('member-vault-metadata', context, metadata, currentKey)
      const source = { ...context, header: { ...context.header, nonce: encrypted.nonce }, ciphertext: encrypted.ciphertext }

      const rotated = await rotateVaultMetadata(source, currentVk, targetVk, { vaultKeyVersion: 3, memberKeyGeneration: 5 })

      expect(rotated.metadataRevision).toBe('10')
      await expect(decryptMemberVaultMetadata(rotated, { organizationId, vaultId,
        keyVersion: 3, memberKeyGeneration: 5 }, targetVk)).resolves.toEqual({ name: 'Primary', color: 'red' })
      await expect(decryptMemberVaultMetadata(rotated, { organizationId, vaultId,
        keyVersion: 3, memberKeyGeneration: 5 }, currentVk)).rejects.toThrow()
      wipe(metadata)
    } finally { wipe(currentVk); wipe(targetVk); wipe(currentKey) }
  })

  it('rewraps one EntryDEK without retaining or decrypting any other Entry', async () => {
    const currentVk = await randomBytes(32)
    const targetVk = await randomBytes(32)
    const entryDek = await randomBytes(32)
    try {
      const context = { organizationId, vaultId, entryId, wrapperRevision: '7', keyVersion: 3,
        memberKeyGeneration: 4, wrappingKeyVersion: 2,
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 8,
          resourceRevision: '7', keyVersion: 3, memberKeyGeneration: 4, nonce: '' } }
      const encrypted = await encryptVaultEnvelope('entry-key-wrapper', context, entryDek, currentVk)
      const source = { ...context, header: { ...context.header, nonce: encrypted.nonce }, wrappedEntryDekByVk: encrypted.ciphertext }

      const rotated = await rewrapEntryKey(source, currentVk, targetVk, { memberKeyGeneration: 5, vaultKeyVersion: 3 })
      expect(rotated.wrapperRevision).toBe('8')
      expect(rotated.memberKeyGeneration).toBe(5)
      const opened = await decryptVaultEnvelope('entry-key-wrapper', rotated, targetVk, {
        aadContext: rotated, minimumMemberKeyGeneration: 5,
      })
      expect(opened).toEqual(entryDek)
      wipe(opened)
      await expect(decryptVaultEnvelope('entry-key-wrapper', rotated, currentVk, {
        aadContext: rotated, minimumMemberKeyGeneration: 5,
      })).rejects.toThrow()
    } finally { wipe(currentVk); wipe(targetVk); wipe(entryDek) }
  })

  it('seals the VDK with the Agent key suite and signs the successor manifest with the message key suite', async () => {
    const sodium = await loadSodium()
    const agent = await generateRecipientKeyPair()
    const agentSigning = sodium.crypto_sign_keypair()
    const vaultMessage = await generateRecipientKeyPair()
    const vaultSigning = sodium.crypto_sign_keypair()
    const vdk = await randomBytes(32)
    try {
      const material = await createAgentDiscoveryMaterial({
        agentId, encryptionPublicKey: toBase64(agent.publicKey), encryptionKeySuiteId: agent.keySuiteId,
        ed25519PublicKey: toBase64(agentSigning.publicKey), recipientKeyVersion: 9, manifestRevision: '12',
      }, { organizationId, vaultId }, {
        vdkVersion: 6, agentMessageKeyVersion: 7, manifestSigningKeyVersion: 8,
      }, {
        vdk, agentMessagePrivateKey: vaultMessage.privateKey, agentMessageKeySuiteId: vaultMessage.keySuiteId,
        manifestSigningPrivateKey: vaultSigning.privateKey,
      }, new Date('2026-07-26T03:00:00.123Z'))

      expect(material.manifest).toMatchObject({
        wrapperSuiteId: KEY_WRAPPER_SUITE.active,
        vaultAgentMessageKeySuiteId: KEY_WRAPPER_SUITE.active,
        vaultAgentMessagePublicKey: encodeBase64Url(vaultMessage.publicKey),
        agentEd25519Fingerprint: await vaultKeyFingerprint(agentSigning.publicKey, 2),
      })
      const { signature, ...unsigned } = material.manifest
      expect(await verifyVaultSignature('PLDNV2SIG:VAULT-MANIFEST:', unsigned, signature,
        decodeBase64Url(material.manifest.vaultSigningPublicKey, 32))).toBe(true)

      const wrapped = material.envelope.wrappedVdk
      const opened = await openKey(wrapped.descriptor, wrapped.encodedSealedKeyPackage, {
        keySuiteId: agent.keySuiteId, keyKind: RECIPIENT_KEY_KIND.agentEncryption, keyVersion: 9,
        publicKey: agent.publicKey, privateKey: agent.privateKey,
      })
      expect(opened).toEqual(vdk)
      wipe(opened)
    } finally {
      wipe(agent.privateKey); wipe(agentSigning.privateKey); wipe(vaultMessage.privateKey)
      wipe(vaultSigning.privateKey); wipe(vdk)
    }
  })

  it('keeps a legacy message key manifest without the successor field and refuses a legacy Agent key', async () => {
    const sodium = await loadSodium()
    const legacyAgent = sodium.crypto_box_keypair()
    const vaultMessage = sodium.crypto_box_keypair()
    const vaultSigning = sodium.crypto_sign_keypair()
    const xwingAgent = await generateRecipientKeyPair()
    const base = { ed25519PublicKey: toBase64(sodium.crypto_sign_keypair().publicKey), recipientKeyVersion: 1, manifestRevision: null }
    const keys = {
      vdk: await randomBytes(32), agentMessagePrivateKey: vaultMessage.privateKey,
      agentMessageKeySuiteId: KEY_WRAPPER_SUITE.legacy, manifestSigningPrivateKey: vaultSigning.privateKey,
    }
    const versions = { vdkVersion: 1, agentMessageKeyVersion: 1, manifestSigningKeyVersion: 1 }
    const material = await createAgentDiscoveryMaterial({
      ...base, agentId, encryptionPublicKey: toBase64(xwingAgent.publicKey), encryptionKeySuiteId: xwingAgent.keySuiteId,
    }, { organizationId, vaultId }, versions, keys)
    expect(material.manifest).not.toHaveProperty('vaultAgentMessageKeySuiteId')
    await expect(createAgentDiscoveryMaterial({
      ...base, agentId, encryptionPublicKey: toBase64(legacyAgent.publicKey), encryptionKeySuiteId: KEY_WRAPPER_SUITE.legacy,
    }, { organizationId, vaultId }, versions, keys)).rejects.toMatchObject({ code: 'key-migration-pending' })
  })
})
