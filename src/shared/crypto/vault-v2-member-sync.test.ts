import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeHex } from './vault-v2-bytes'
import {
  decryptMemberIndex,
  decryptMemberVaultMetadata,
  encryptMemberVaultMetadata,
  type MemberIndexEnvelope,
  type VaultEntryKeyEnvelope,
} from './vault-v2-member-sync'

describe('Member Vault metadata writes', () => {
  it('round-trips a new authenticated revision under an isolated VK-derived key', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const scope = {
      organizationId: '00112233-4455-4677-8899-aabbccddeeff',
      vaultId: '11112233-4455-4677-8899-aabbccddeeff',
      metadataRevision: '9',
      keyVersion: 4,
      memberKeyGeneration: 3,
    }
    const envelope = await encryptMemberVaultMetadata({
      name: 'Production',
      description: 'Encrypted locally',
      iconReference: 'asset:22222233-4455-4677-8899-aabbccddeeff',
      color: '#EB4747',
    }, scope, vaultKey)

    expect(envelope).not.toHaveProperty('name')
    await expect(decryptMemberVaultMetadata(envelope, scope, vaultKey)).resolves.toEqual({
      name: 'Production',
      description: 'Encrypted locally',
      iconReference: 'asset:22222233-4455-4677-8899-aabbccddeeff',
      color: '#EB4747',
    })
  })
})

interface AeadVector {
  id: string
  decryptionKeyHex: string
  envelope: Record<string, unknown>
}

const fixtureRoot = resolve(process.cwd(), 'src/shared/crypto/fixtures/vault-v2')

const fixture = JSON.parse(readFileSync(join(fixtureRoot, 'vectors/envelopes.json'), 'utf8')) as { aeadVectors: AeadVector[] }
const memberIndex = fixture.aeadVectors.find((vector) => vector.id === 'member-index')!
const entryKey = fixture.aeadVectors.find((vector) => vector.id === 'vault-entry-key')!
const indexEnvelope = memberIndex.envelope as unknown as MemberIndexEnvelope
const entryKeyEnvelope = entryKey.envelope as unknown as VaultEntryKeyEnvelope
const trusted = {
  organizationId: indexEnvelope.organizationId,
  vaultId: indexEnvelope.vaultId,
  entryId: indexEnvelope.entryId,
  memberIndexRevision: indexEnvelope.memberIndexRevision,
  keyVersion: indexEnvelope.header.keyVersion,
  memberKeyGeneration: indexEnvelope.header.memberKeyGeneration,
  wrappingKeyVersion: entryKeyEnvelope.wrappingKeyVersion,
}

describe('Vault member sync projection', () => {
    it('unwraps the current EntryDEK with VK before deriving and decrypting MemberIndex', async () => {
      await expect(decryptMemberIndex(
        indexEnvelope,
        entryKeyEnvelope,
        trusted,
        decodeHex(entryKey.decryptionKeyHex),
      )).resolves.toEqual({
        memberLabel: 'Stage Database',
        entryType: 1,
        searchFields: ['database', 'stage'],
        iconReference: 'asset:synthetic-db',
      })
    })

    it.each([
      ['entry identity', { entryId: '44444444-4444-4444-8444-444444444444' }],
      ['EntryDEK version', { keyVersion: trusted.keyVersion + 1 }],
      ['member generation', { memberKeyGeneration: trusted.memberKeyGeneration + 1 }],
      ['wrapping key version', { wrappingKeyVersion: trusted.wrappingKeyVersion + 1 }],
    ])('rejects authenticated %s substitution', async (_name, change) => {
      await expect(decryptMemberIndex(
        indexEnvelope,
        entryKeyEnvelope,
        { ...trusted, ...change },
        decodeHex(entryKey.decryptionKeyHex),
      )).rejects.toThrow()
    })

    it('rejects a wrapper from another Entry before exposing MemberIndex', async () => {
      const substituted = {
        ...entryKeyEnvelope,
        entryId: '44444444-4444-4444-8444-444444444444',
      }
      await expect(decryptMemberIndex(
        indexEnvelope,
        substituted,
        trusted,
        decodeHex(entryKey.decryptionKeyHex),
      )).rejects.toThrow('context mismatch')
    })
})
