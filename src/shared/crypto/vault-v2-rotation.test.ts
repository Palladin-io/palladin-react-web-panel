import { describe, expect, it } from 'vitest'
import { toBase64 } from './encoding'
import { decodeBase64Url, encodeBase64Url } from './vault-v2-bytes'
import { decryptVaultEnvelope, encryptVaultEnvelope, openVaultProtocolPackage } from './vault-v2-envelope'
import { createAgentDiscoveryMaterial, rewrapEntryKey, vaultKeyFingerprint } from './vault-v2-rotation'
import { canonicalizeVaultJson, verifyVaultSignature } from './vault-v2-signatures'
import { loadSodium, randomBytes, wipe } from './sodium'

const organizationId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'
const entryId = '33333333-3333-4333-8333-333333333333'
const agentId = '44444444-4444-4444-8444-444444444444'

describe('Vault rotation crypto', () => {
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

  it('binds an Agent VDK package and manifest to both Agent identity keys', async () => {
    const sodium = await loadSodium()
    const agentBox = sodium.crypto_box_keypair()
    const agentSigning = sodium.crypto_sign_keypair()
    const vaultMessage = sodium.crypto_box_keypair()
    const vaultSigningSeed = await randomBytes(32)
    const vdk = await randomBytes(32)
    try {
      const material = await createAgentDiscoveryMaterial({
        agentId, x25519PublicKey: toBase64(agentBox.publicKey), ed25519PublicKey: toBase64(agentSigning.publicKey),
        recipientKeyVersion: 9, manifestRevision: '12',
      }, { organizationId, vaultId }, {
        vdkVersion: 6, agentMessageKeyVersion: 7, manifestSigningKeyVersion: 8,
      }, { vdk, agentMessagePrivateKey: vaultMessage.privateKey, manifestSigningSeed: vaultSigningSeed },
      new Date('2026-07-26T03:00:00.123Z'))

      expect(material.envelope.recipientAgentKeyFingerprint).toBe(await vaultKeyFingerprint(agentBox.publicKey, 1))
      expect(material.manifest.agentEd25519Fingerprint).toBe(await vaultKeyFingerprint(agentSigning.publicKey, 2))
      const { signature, ...unsigned } = material.manifest
      expect(await verifyVaultSignature('PLDNV2SIG:VAULT-MANIFEST:', unsigned, signature,
        decodeBase64Url(material.manifest.vaultSigningPublicKey, 32))).toBe(true)

      const plaintext = await openVaultProtocolPackage(decodeBase64Url(material.envelope.agentWrappedVdk),
        agentBox.publicKey, agentBox.privateKey)
      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as Record<string, unknown>
      expect(canonicalizeVaultJson(payload as never)).toBe(new TextDecoder().decode(plaintext))
      expect(payload).toMatchObject({ organizationId, vaultId, agentId, vdkVersion: 6, vdk: encodeBase64Url(vdk) })
      wipe(plaintext)
    } finally {
      wipe(agentBox.privateKey); wipe(agentSigning.privateKey); wipe(vaultMessage.privateKey)
      wipe(vaultSigningSeed); wipe(vdk)
    }
  })
})
