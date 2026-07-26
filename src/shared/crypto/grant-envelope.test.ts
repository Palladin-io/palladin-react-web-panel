import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL } from '../../features/vaults/types'
import { toBase64 } from './encoding'
import { buildGrantPayload, produceGrantEntryEnvelope } from './grant-envelope'
import { decodeBase64Url } from './vault-v2-bytes'
import { encodeVaultAad } from './vault-v2-protocol'
import { loadSodium } from './sodium'

const memberSecret = {
  schemaVersion: 1 as const,
  memberLabel: 'Private label',
  agentLabel: 'Work login',
  entryType: ENTRY_TYPE_CREDENTIAL,
  content: {
    type: ENTRY_TYPE_CREDENTIAL,
    username: 'octocat',
    password: 'secret',
    url: 'https://github.com/login',
    totp: 'otpauth://totp/example?secret=ABC',
    notes: 'member only',
  },
  agentVisibilityPolicy: {
    discoverable: true,
    fields: {
      agentLabel: 'discovery' as const,
      username: 'discovery' as const,
      password: 'onGrantValue' as const,
      url: 'onGrantValue' as const,
      totp: 'onGrantDerived' as const,
      notes: 'never' as const,
    },
  },
}

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  vaultId: '22222222-2222-4222-8222-222222222222',
  grantId: '33333333-3333-4333-8333-333333333333',
  agentId: '44444444-4444-4444-8444-444444444444',
  entryId: '55555555-5555-4555-8555-555555555555',
  entryRevision: '7',
  grantEnvelopeRevision: '2',
  grantKeyVersion: 2,
  memberKeyGeneration: 3,
  recipientAgentKeyVersion: 4,
  approvedMethods: 6,
  remainingUses: 5,
}

describe('produceGrantEntryEnvelope', () => {
  it('round-trips the filtered canonical payload with the frozen AAD', async () => {
    const sodium = await loadSodium()
    const agent = sodium.crypto_box_keypair()
    const envelope = await produceGrantEntryEnvelope({
      memberSecret,
      scope,
      agentPublicKey: toBase64(agent.publicKey),
    })
    const grantDek = sodium.crypto_box_seal_open(
      decodeBase64Url(envelope.agentWrappedGrantDek),
      agent.publicKey,
      agent.privateKey,
    )
    const context = {
      ...scope,
      useLimit: scope.remainingUses,
      recipientAgentKeyFingerprint: envelope.agentKeyFingerprint,
      header: {
        protocolVersion: 2,
        algorithmSuite: 1,
        resourceKind: 4,
        projectionKind: 6,
        resourceRevision: scope.grantEnvelopeRevision,
        keyVersion: scope.grantKeyVersion,
        memberKeyGeneration: scope.memberKeyGeneration,
        nonce: envelope.nonce,
      },
    }
    const recovered = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      decodeBase64Url(envelope.ciphertext),
      encodeVaultAad('grant-payload', context),
      decodeBase64Url(envelope.nonce),
      grantDek,
    )
    const payload = JSON.parse(new TextDecoder().decode(recovered))
    expect(payload.fields).toEqual({
      password: { access: 'onGrantValue', value: 'secret' },
      totp: { access: 'onGrantDerived', value: 'otpauth://totp/example?secret=ABC' },
      url: { access: 'onGrantValue', value: 'https://github.com/login' },
    })
    expect(JSON.stringify(payload)).not.toContain('member only')
    expect(JSON.stringify(payload)).not.toContain('Private label')
  })

  it('uses a fresh GrantDEK and nonce for every revision envelope', async () => {
    const sodium = await loadSodium()
    const agentPublicKey = toBase64(sodium.crypto_box_keypair().publicKey)
    const first = await produceGrantEntryEnvelope({ memberSecret, scope, agentPublicKey })
    const second = await produceGrantEntryEnvelope({ memberSecret, scope, agentPublicKey })
    expect(first.nonce).not.toBe(second.nonce)
    expect(first.ciphertext).not.toBe(second.ciphertext)
    expect(first.agentWrappedGrantDek).not.toBe(second.agentWrappedGrantDek)
  })

  it('fails closed when a concrete grant attempts to exceed policy', () => {
    expect(() => buildGrantPayload(memberSecret, ['password', 'notes'])).toThrow(
      'exceeds Agent Visibility Policy',
    )
  })
})
