import { describe, expect, it } from 'vitest'
import { memberIndexEnvelopeSchema, vaultEntryKeyEnvelopeSchema } from './entry-envelope-schema'
import { canonicalUuidSchema, memberVaultKeyEnvelopeSchema } from './vault-key-material-schema'

const scope = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  vaultId: '22222222-2222-4222-8222-222222222222',
  entryId: '33333333-3333-4333-8333-333333333333',
  grantOrRequestId: null,
  agentId: null,
  memberId: null,
}

function descriptor(purpose: string, binding: object) {
  return {
    protocolVersion: 2,
    cryptoSuiteId: 'palladin-vault-xchacha-v1',
    purpose,
    scope,
    resourceRevision: '1',
    keyVersion: 1,
    memberKeyGeneration: 1,
    binding,
  }
}

describe('canonical Vault API envelope schemas', () => {
  it('accepts canonical UUIDv7 identifiers emitted by the backend', () => {
    expect(canonicalUuidSchema.parse('019fa51e-1d28-73fa-ad88-beee6936af4f'))
      .toBe('019fa51e-1d28-73fa-ad88-beee6936af4f')
  })

  it('parses the nested descriptor and suite payload contract', () => {
    const parsed = memberIndexEnvelopeSchema.parse({
      descriptor: descriptor('memberIndex', {}),
      encodedSuitePayload: 'ciphertext',
    })

    expect(parsed.descriptor.scope.entryId).toBe(scope.entryId)
    expect(parsed.descriptor.purpose).toBe(5)
  })

  it('rejects the removed flattened Entry key contract', () => {
    expect(() => vaultEntryKeyEnvelopeSchema.parse({
      organizationId: scope.organizationId,
      vaultId: scope.vaultId,
      entryId: scope.entryId,
      wrapperRevision: '1',
      keyVersion: 1,
      memberKeyGeneration: 1,
      wrappingKeyVersion: 1,
      wrappedEntryDekByVk: 'ciphertext',
    })).toThrow()
  })

  it('requires explicit nullable scope fields and the nested wrapped Vault key', () => {
    const wrappedVaultKey = {
      descriptor: {
        protocolVersion: 2,
        wrapperSuiteId: 'palladin-x25519-sealed-box-v1',
        purpose: 'memberVaultKey',
        scope: { ...scope, entryId: null, memberId: '44444444-4444-4444-8444-444444444444' },
        resourceRevision: '1',
        wrappedKeyVersion: 1,
        memberKeyGeneration: 1,
        recipientKeyKind: 'memberX25519',
        recipientKeyVersion: 1,
        recipientFingerprint: 'fingerprint',
        parentDescriptorHash: null,
      },
      encodedSealedKeyPackage: 'sealed',
    }
    expect(memberVaultKeyEnvelopeSchema.parse({ wrappedVaultKey }).wrappedVaultKey.encodedSealedKeyPackage).toBe('sealed')

    const missingNullableField = structuredClone(wrappedVaultKey)
    delete (missingNullableField.descriptor.scope as Partial<typeof scope>).agentId
    expect(() => memberVaultKeyEnvelopeSchema.parse({ wrappedVaultKey: missingNullableField })).toThrow()
  })
})
