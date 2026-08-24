import { describe, expect, it } from 'vitest'
import { fromBase64Url, toBase64, toBase64Url } from './encoding'
import { loadSodium, wipe } from './sodium'
import {
  buildAgentWrappedVaultKey,
  computeVaultKeyFingerprint,
  openKeyFromX25519Recipient,
  type X25519WrapperContext,
  VAULT_KEY_KIND,
  wrapperContextFromMemberVaultKey,
  X25519_SEALED_BOX_V1,
} from './x25519-wrapper'

describe('Member Vault-key wrapper context', () => {
  it('uses the frozen vkVersion rule and domain-separated Member fingerprint', async () => {
    const publicKey = new Uint8Array(32).fill(0x44)
    const fingerprint = await computeVaultKeyFingerprint(publicKey, VAULT_KEY_KIND.memberX25519)
    const context = wrapperContextFromMemberVaultKey({
      wrappedVaultKey: {
        descriptor: {
          protocolVersion: 2, wrapperSuiteId: X25519_SEALED_BOX_V1, purpose: 1,
          scope: { organizationId: '00112233-4455-6677-8899-aabbccddeeff', vaultId: '11112222-3333-4444-8555-666677778888', memberId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
          resourceRevision: '7', wrappedKeyVersion: 7, memberKeyGeneration: 3,
          recipientKeyKind: 5, recipientKeyVersion: 2,
          recipientFingerprint: toBase64Url(fingerprint), parentDescriptorHash: null,
        }, encodedSealedKeyPackage: toBase64Url(new Uint8Array(120)),
      },
    })
    expect(context).toMatchObject({
      purpose: 1,
      resourceRevision: 7n,
      wrappedKeyVersion: 7,
      recipientKeyKind: 5,
      recipientKeyVersion: 2,
    })
    expect(context.parentDescriptorHash).toBeUndefined()
  })

  it('rejects a downgraded wrapper protocol before any unwrap attempt', async () => {
    const fingerprint = await computeVaultKeyFingerprint(new Uint8Array(32), VAULT_KEY_KIND.memberX25519)
    expect(() => wrapperContextFromMemberVaultKey({
      wrappedVaultKey: {
        descriptor: {
          protocolVersion: 1, wrapperSuiteId: X25519_SEALED_BOX_V1, purpose: 1,
          scope: { organizationId: '00112233-4455-6677-8899-aabbccddeeff', vaultId: '11112222-3333-4444-8555-666677778888', memberId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
          resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1,
          recipientKeyKind: 5, recipientKeyVersion: 1,
          recipientFingerprint: toBase64Url(fingerprint),
        }, encodedSealedKeyPackage: toBase64Url(new Uint8Array(120)),
      },
    })).toThrow('downgraded')
  })

  it('wraps the whole VK to one Agent and binds grant plus access epoch', async () => {
    const sodium = await loadSodium()
    const agent = sodium.crypto_box_keypair()
    const vaultKey = new Uint8Array(32).fill(0x5a)
    try {
      const envelope = await buildAgentWrappedVaultKey({
        vaultKey,
        organizationId: '00112233-4455-6677-8899-aabbccddeeff',
        vaultId: '11112222-3333-4444-8555-666677778888',
        grantId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        agentId: 'cccccccc-dddd-4eee-8fff-000000000000',
        agentAccessEpoch: 7,
        vaultKeyVersion: 3,
        recipientAgentKeyVersion: 4,
        agentPublicKey: toBase64(agent.publicKey),
      })
      const descriptor = envelope.wrappedVaultKey.descriptor
      expect(descriptor).toMatchObject({
        purpose: 5,
        resourceRevision: '7',
        wrappedKeyVersion: 3,
        memberKeyGeneration: null,
        scope: {
          grantOrRequestId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
          agentId: 'cccccccc-dddd-4eee-8fff-000000000000',
        },
      })
      const opened = await openKeyFromX25519Recipient(
        fromBase64Url(envelope.wrappedVaultKey.encodedSealedKeyPackage),
        agent.publicKey,
        agent.privateKey,
        {
          protocolVersion: descriptor.protocolVersion,
          wrapperSuiteId: X25519_SEALED_BOX_V1,
          purpose: descriptor.purpose,
          organizationId: descriptor.scope.organizationId,
          vaultId: descriptor.scope.vaultId,
          grantOrRequestId: descriptor.scope.grantOrRequestId ?? undefined,
          agentId: descriptor.scope.agentId ?? undefined,
          resourceRevision: BigInt(descriptor.resourceRevision),
          wrappedKeyVersion: descriptor.wrappedKeyVersion,
          recipientKeyKind: descriptor.recipientKeyKind,
          recipientKeyVersion: descriptor.recipientKeyVersion,
          recipientFingerprint: fromBase64Url(descriptor.recipientFingerprint),
        } satisfies X25519WrapperContext,
      )
      expect(opened).toEqual(vaultKey)
      wipe(opened)
    } finally {
      wipe(vaultKey)
      wipe(agent.privateKey)
      wipe(agent.publicKey)
    }
  })
})
