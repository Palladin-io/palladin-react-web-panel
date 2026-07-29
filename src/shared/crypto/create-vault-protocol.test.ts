import { describe, expect, it } from 'vitest'
import { createVaultProtocolPayload } from './create-vault-protocol'

describe('createVaultProtocolPayload', () => {
  it('builds the complete bounded protocol-2 request accepted by the backend contract', async () => {
    const payload = await createVaultProtocolPayload({
      organizationId: '11111111-1111-4111-8111-111111111111',
      vaultId: '22222222-2222-4222-8222-222222222222',
      memberId: '33333333-3333-4333-8333-333333333333',
      memberKeyVersion: 1,
      memberPrivateKey: new Uint8Array(32).fill(7),
      metadata: {
        schema: 'palladin.member-vault-metadata.v1',
        name: 'Personal',
        description: null,
        icon: { kind: 'glyph', value: 'shield' },
        color: '#EB4747',
        grantMode: 'granular',
      },
    })

    expect(payload.currentKeyEpoch).toEqual({
      vaultKeyVersion: 1,
      vdkVersion: 1,
      agentMessageKeyVersion: 1,
      manifestSigningKeyVersion: 1,
    })
    expect(payload.creatorVaultKey.wrappedVaultKey.descriptor).toMatchObject({
      protocolVersion: 2,
      purpose: 1,
      scope: {
        organizationId: '11111111-1111-4111-8111-111111111111',
        vaultId: '22222222-2222-4222-8222-222222222222',
        memberId: '33333333-3333-4333-8333-333333333333',
      },
      resourceRevision: '1',
      wrappedKeyVersion: 1,
      memberKeyGeneration: 1,
      recipientKeyKind: 5,
      recipientKeyVersion: 1,
    })
    expect(payload.creatorVaultKey.wrappedVaultKey.descriptor.recipientFingerprint).toHaveLength(43)
    expect(payload.creatorVaultKey.wrappedVaultKey.encodedSealedKeyPackage).toHaveLength(160)
    expect(payload.vaultPrivateKeys).toHaveLength(2)
    expect(payload.discoveryKey.encodedSuitePayload.length).toBeLessThanOrEqual(374)
    for (const envelope of payload.vaultPrivateKeys) {
      expect(envelope.encodedSuitePayload.length).toBeLessThanOrEqual(374)
    }
    expect(payload.vaultAgentMessagePublicKey).toMatchObject({ keyKind: 1, keyVersion: 1 })
    expect(payload.vaultManifestSigningPublicKey).toMatchObject({ keyKind: 2, keyVersion: 1 })
  })
})
