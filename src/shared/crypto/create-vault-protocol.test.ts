import { generateRecipientKeyPair, KEY_WRAPPER_SUITE } from '@palladin/crypto'
import { describe, expect, it } from 'vitest'
import { createVaultProtocolPayload } from './create-vault-protocol'
import { openMemberVaultKey } from './vault-protocol'

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  vaultId: '22222222-2222-4222-8222-222222222222',
  memberId: '33333333-3333-4333-8333-333333333333',
}
const metadata = {
  schema: 'palladin.member-vault-metadata.v1' as const,
  name: 'Personal',
  description: null,
  icon: { kind: 'glyph' as const, value: 'shield' },
  color: '#EB4747',
  grantMode: 'granular' as const,
}

describe('createVaultProtocolPayload', () => {
  it('wraps the creator VK for an X-Wing Member key and publishes an X-Wing agent message key', async () => {
    const member = await generateRecipientKeyPair()
    const payload = await createVaultProtocolPayload({
      ...scope,
      memberKeyVersion: 2,
      memberKey: { keySuiteId: member.keySuiteId, privateKey: member.privateKey },
      metadata,
    })

    expect(payload.currentKeyEpoch).toEqual({
      vaultKeyVersion: 1, vdkVersion: 1, agentMessageKeyVersion: 1, manifestSigningKeyVersion: 1,
    })
    expect(payload.creatorVaultKey.wrappedVaultKey.descriptor).toMatchObject({
      protocolVersion: 2,
      wrapperSuiteId: KEY_WRAPPER_SUITE.active,
      purpose: 1,
      scope,
      resourceRevision: '1',
      wrappedKeyVersion: 1,
      memberKeyGeneration: 1,
      recipientKeyKind: 5,
      recipientKeyVersion: 2,
    })
    expect(payload.vaultAgentMessagePublicKey).toMatchObject({
      schemeId: KEY_WRAPPER_SUITE.active, keyKind: 'agentMessage', keyVersion: 1,
    })
    expect(payload.vaultManifestSigningPublicKey).toMatchObject({ keyKind: 'manifestSigning', keyVersion: 1 })
    expect(payload.vaultPrivateKeys).toHaveLength(2)

    const vaultKey = await openMemberVaultKey(payload.creatorVaultKey, {
      keySuiteId: member.keySuiteId, privateKey: member.privateKey,
    })
    expect(vaultKey).toHaveLength(32)
  })

  it('refuses a legacy Member key with key-migration-pending instead of sealing to the read-only suite', async () => {
    await expect(createVaultProtocolPayload({
      ...scope,
      memberKeyVersion: 1,
      memberKey: { keySuiteId: KEY_WRAPPER_SUITE.legacy, privateKey: new Uint8Array(32).fill(7) },
      metadata,
    })).rejects.toMatchObject({ code: 'key-migration-pending' })
  })
})
