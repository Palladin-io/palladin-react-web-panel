import { describe, expect, it } from 'vitest'
import { toBase64 } from './encoding'
import { buildCanonicalGrantEnvelope } from './grant-protocol'
import { loadSodium, wipe } from './sodium'
import type { MemberSecretV1 } from './vault-plaintext'

const secret: MemberSecretV1 = {
  schema: 'palladin.member-secret.v1', memberLabel: 'Database', agentLabel: 'Database',
  discoverable: true, description: null, icon: null, color: null, entryType: 'credential',
  agentFieldAccess: {
    memberLabel: 'never', agentLabel: 'discovery', description: 'never', icon: 'never', color: 'never',
    entryType: 'discovery', 'credential.username': 'onGrantValue',
    'credential.password': 'onGrantValue', 'credential.url': 'never',
    'credential.urlDomain': 'discovery', 'credential.totp': 'never', notes: 'never',
  },
  content: {
    username: 'alice', password: 'secret', url: null, urlDomain: null, totp: null,
    notes: null, customFields: [],
  },
}

describe('canonical Grant protocol', () => {
  it('binds the selected fields and caller-provided revision/key version', async () => {
    const sodium = await loadSodium()
    const agent = sodium.crypto_box_keypair()
    try {
      const envelope = await buildCanonicalGrantEnvelope({
        organizationId: '00112233-4455-6677-8899-aabbccddeeff',
        vaultId: '11112222-3333-4444-8555-666677778888',
        entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        grantId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        agentId: 'cccccccc-dddd-4eee-8fff-000000000000',
        entryRevision: '7', memberKeyGeneration: 3,
        agentPublicKey: toBase64(agent.publicKey), recipientKeyVersion: 4,
        grantEnvelopeRevision: '8', grantKeyVersion: 5,
        approvedFieldIds: ['credential.password'], approvedMethods: 1, secret,
      })
      expect(envelope.descriptor.resourceRevision).toBe('8')
      expect(envelope.descriptor.keyVersion).toBe(5)
      expect(envelope.wrappedGrantDek.descriptor.resourceRevision).toBe('8')
      expect(envelope.wrappedGrantDek.descriptor.wrappedKeyVersion).toBe(5)
      expect(envelope.fieldIds).toEqual(['credential.password'])
    } finally {
      wipe(agent.privateKey); wipe(agent.publicKey)
    }
  })

  it('rejects fields outside the approved Agent policy', async () => {
    const sodium = await loadSodium()
    const agent = sodium.crypto_box_keypair()
    try {
      await expect(buildCanonicalGrantEnvelope({
        organizationId: '00112233-4455-6677-8899-aabbccddeeff',
        vaultId: '11112222-3333-4444-8555-666677778888',
        entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        grantId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
        agentId: 'cccccccc-dddd-4eee-8fff-000000000000', entryRevision: '1',
        memberKeyGeneration: 1, agentPublicKey: toBase64(agent.publicKey), recipientKeyVersion: 1,
        grantEnvelopeRevision: '1', grantKeyVersion: 1,
        approvedFieldIds: ['credential.url'], approvedMethods: 1, secret,
      })).rejects.toThrow('not grantable')
    } finally {
      wipe(agent.privateKey); wipe(agent.publicKey)
    }
  })
})
