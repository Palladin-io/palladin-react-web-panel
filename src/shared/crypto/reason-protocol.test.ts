import { describe, expect, it } from 'vitest'
import { ENVELOPE_PURPOSE } from './envelope'
import { openEncryptedReason, type EncryptedReasonContract } from './reason-protocol'
import { VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { X25519_SEALED_BOX_V1 } from './x25519-wrapper'

describe('openEncryptedReason', () => {
  it('rejects outer grant substitution before opening any key material', async () => {
    const envelope = {
      descriptor: {
        protocolVersion: 2, cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
        purpose: ENVELOPE_PURPOSE.reason,
        scope: {
          organizationId: '00112233-4455-6677-8899-aabbccddeeff',
          vaultId: '11112222-3333-4444-8555-666677778888',
          entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          grantOrRequestId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
          agentId: 'cccccccc-dddd-4eee-8fff-000000000000',
        },
        resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1,
        binding: { wrapperSuiteId: X25519_SEALED_BOX_V1, recipientKeyVersion: 1, recipientKeyFingerprint: 'AA', requestedMethods: 1 },
      },
      encodedSuitePayload: 'AA', wrappedReasonDek: { descriptor: {}, encodedSealedKeyPackage: 'AA' }, agentSignature: 'AA',
    } as unknown as EncryptedReasonContract
    await expect(openEncryptedReason(envelope, [], new Uint8Array(32), {
      organizationId: envelope.descriptor.scope.organizationId,
      vaultId: envelope.descriptor.scope.vaultId,
      entryId: envelope.descriptor.scope.entryId!,
      grantId: 'dddddddd-eeee-4fff-8000-111111111111',
      agentId: envelope.descriptor.scope.agentId!,
    })).rejects.toThrow('outer resource scope')
  })
})
