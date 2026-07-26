import { describe, expect, it } from 'vitest'
import { decryptEncryptedReason, type EncryptedReasonEnvelope } from './encrypted-reason'
import { encodeBase64Url, encodeUtf8 } from './vault-v2-bytes'
import { encryptVaultEnvelope, sealVaultProtocolPackage } from './vault-v2-envelope'
import { vaultKeyFingerprint } from './vault-v2-rotation'
import { loadSodium } from './sodium'

async function fixture(): Promise<{ envelope: EncryptedReasonEnvelope; privateKey: Uint8Array }> {
  const sodium = await loadSodium()
  const recipient = sodium.crypto_box_keypair()
  const reasonDek = sodium.randombytes_buf(32)
  const context: EncryptedReasonEnvelope = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    vaultId: '22222222-2222-4222-8222-222222222222',
    entryId: '55555555-5555-4555-8555-555555555555',
    grantRequestId: '33333333-3333-4333-8333-333333333333',
    agentId: '44444444-4444-4444-8444-444444444444',
    requestRevision: '7',
    header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 3, projectionKind: 5, resourceRevision: '7', keyVersion: 1, memberKeyGeneration: 3, nonce: '' },
    reasonKeyVersion: 1,
    agentMessageKeyVersion: 2,
    recipientAgentMessageKeyFingerprint: await vaultKeyFingerprint(recipient.publicKey, 4),
    requestedMethods: 6,
    ciphertext: '',
    agentMessageWrappedReasonDek: '',
    agentSignature: 'A'.repeat(86),
  }
  const encrypted = await encryptVaultEnvelope(
    'encrypted-reason',
    context,
    encodeUtf8(JSON.stringify({ reason: 'Deploy the release' })),
    reasonDek,
  )
  const wrapped = await sealVaultProtocolPackage(reasonDek, recipient.publicKey)
  return {
    envelope: {
      ...context,
      header: { ...context.header, nonce: encrypted.nonce },
      ciphertext: encrypted.ciphertext,
      agentMessageWrappedReasonDek: encodeBase64Url(wrapped),
    },
    privateKey: recipient.privateKey,
  }
}

describe('decryptEncryptedReason', () => {
  it('decrypts only with the bound Agent Message recipient and exact AAD', async () => {
    const { envelope, privateKey } = await fixture()
    await expect(decryptEncryptedReason(envelope, privateKey)).resolves.toBe('Deploy the release')
  })

  it('fails closed when scope authenticated by AAD is changed', async () => {
    const { envelope, privateKey } = await fixture()
    const tampered = { ...envelope, requestedMethods: 2 }
    await expect(decryptEncryptedReason(tampered, privateKey)).rejects.toThrow()
  })

  it('fails before decryption for a different Agent Message key', async () => {
    const sodium = await loadSodium()
    const { envelope } = await fixture()
    await expect(decryptEncryptedReason(envelope, sodium.crypto_box_keypair().privateKey))
      .rejects.toThrow('recipient fingerprint mismatch')
  })
})
