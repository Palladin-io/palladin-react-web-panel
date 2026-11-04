import { encodeKeyWrapperContext, generateRecipientKeyPair, KEY_WRAPPER_SUITE, sha256Digest } from '@palladin/crypto'
import { describe, expect, it } from 'vitest'
import { ENVELOPE_PURPOSE } from './envelope'
import { VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { toBase64Url } from './encoding'
import { deriveVaultSubkey } from './hkdf'
import { loadSodium, wipe } from './sodium'
import { encodeMemberVaultMetadata } from './vault-plaintext'
import { sealVaultEnvelope } from './vault-envelope'
import { openMemberVaultKey, openVaultProjection, rewrapOwnMemberVaultKey, sealMemberVaultMetadata } from './vault-protocol'
import {
  KEY_WRAPPER_PURPOSE,
  RECIPIENT_KEY_KIND,
  recipientFingerprint,
  wrapKeyForRecipient,
  type KeyWrapperDescriptorContract,
  type MemberVaultKeyEnvelopeContract,
} from './key-wrapper'
import { concatBytes, encodeUtf8 } from './vault-v2-bytes'

const organizationId = '00112233-4455-6677-8899-aabbccddeeff'
const vaultId = '11112222-3333-4444-8555-666677778888'
const memberId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const memberScope = { organizationId, vaultId, memberId }

async function wrapForMember(vaultKey: Uint8Array, member: { keySuiteId: string; publicKey: Uint8Array }, keyVersion = 1) {
  return { wrappedVaultKey: await wrapKeyForRecipient(vaultKey, {
    keySuiteId: member.keySuiteId, keyKind: RECIPIENT_KEY_KIND.memberEncryption, keyVersion, publicKey: member.publicKey,
  }, {
    purpose: KEY_WRAPPER_PURPOSE.memberVaultKey, scope: memberScope,
    resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1,
  }) }
}

/** A pre-migration envelope: the read-only suite can no longer seal, so build its frozen layout directly. */
async function legacyMemberEnvelope(vaultKey: Uint8Array, publicKey: Uint8Array): Promise<MemberVaultKeyEnvelopeContract> {
  const sodium = await loadSodium()
  const descriptor: KeyWrapperDescriptorContract = {
    protocolVersion: 2, wrapperSuiteId: KEY_WRAPPER_SUITE.legacy, purpose: KEY_WRAPPER_PURPOSE.memberVaultKey,
    scope: memberScope, resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1,
    recipientKeyKind: RECIPIENT_KEY_KIND.memberEncryption, recipientKeyVersion: 1,
    recipientFingerprint: recipientFingerprint({
      keySuiteId: KEY_WRAPPER_SUITE.legacy, keyKind: RECIPIENT_KEY_KIND.memberEncryption, publicKey,
    }),
    parentDescriptorHash: null,
  }
  const contextHash = sha256Digest(concatBytes(encodeUtf8('PLDNX2CTX'), encodeKeyWrapperContext(descriptor)))
  const sealed = sodium.crypto_box_seal(concatBytes(encodeUtf8('PLDNX2K1'), vaultKey, contextHash), publicKey)
  return { wrappedVaultKey: { descriptor, encodedSealedKeyPackage: toBase64Url(sealed) } }
}

describe('openVaultProjection', () => {
  it('authenticates outer scope, unwraps an X-Wing VK and decrypts metadata', async () => {
    const sodium = await loadSodium()
    const member = await generateRecipientKeyPair()
    const vaultKey = sodium.randombytes_buf(32)
    const memberContract = await wrapForMember(vaultKey, member)
    const descriptor = {
      protocolVersion: 2, cryptoSuiteId: 'palladin-vault-xchacha-v1',
      purpose: ENVELOPE_PURPOSE.memberVaultMetadata,
      scope: { organizationId, vaultId },
      resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1, binding: {},
    } as const
    const metadataKey = await deriveVaultSubkey(vaultKey, {
      protocolVersion: 2, cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
      purpose: ENVELOPE_PURPOSE.memberVaultMetadata, organizationId,
      vaultId, keyVersion: 1, memberKeyGeneration: 1,
    })
    const envelope = await sealVaultEnvelope(descriptor, encodeMemberVaultMetadata({
      schema: 'palladin.member-vault-metadata.v1', name: 'Personal', description: null,
      icon: null, color: '#AABBCC', grantMode: 'granular',
    }), metadataKey)
    const opened = await openVaultProjection({
      id: vaultId, organizationId,
      memberKeyGeneration: 1, memberVaultMetadata: envelope, memberVaultKey: memberContract,
    }, { keySuiteId: member.keySuiteId, privateKey: member.privateKey }, memberId)
    expect(opened.metadata.name).toBe('Personal')
    expect(Array.from(opened.vaultKey)).toEqual(Array.from(vaultKey))
    wipe(opened.vaultKey); wipe(vaultKey); wipe(metadataKey); wipe(member.privateKey)
  })
})

describe('openMemberVaultKey', () => {
  it('opens a legacy envelope during the transition with the legacy key the account publishes', async () => {
    const sodium = await loadSodium()
    const legacy = sodium.crypto_box_keypair()
    const vaultKey = sodium.randombytes_buf(32)
    const envelope = await legacyMemberEnvelope(vaultKey, legacy.publicKey)
    const opened = await openMemberVaultKey(envelope, { keySuiteId: KEY_WRAPPER_SUITE.legacy, privateKey: legacy.privateKey })
    expect(Array.from(opened)).toEqual(Array.from(vaultKey))
  })

  it('rejects an envelope whose suite differs from the suite the account publishes for this key', async () => {
    const member = await generateRecipientKeyPair()
    const envelope = await wrapForMember(new Uint8Array(32).fill(4), member)
    await expect(openMemberVaultKey(envelope, { keySuiteId: KEY_WRAPPER_SUITE.legacy, privateKey: member.privateKey }))
      .rejects.toMatchObject({ code: 'recipient-mismatch' })
  })
})

describe('rewrapOwnMemberVaultKey', () => {
  it('moves the current VK from the legacy key to the new X-Wing key with the same bindings', async () => {
    const sodium = await loadSodium()
    const legacy = sodium.crypto_box_keypair()
    const next = await generateRecipientKeyPair()
    const vaultKey = sodium.randombytes_buf(32)
    const legacyEnvelope = await legacyMemberEnvelope(vaultKey, legacy.publicKey)
    const rewrapped = await rewrapOwnMemberVaultKey({
      vault: { id: vaultId, organizationId, memberKeyGeneration: 1, memberVaultKey: legacyEnvelope },
      memberId,
      legacyKey: { keySuiteId: KEY_WRAPPER_SUITE.legacy, privateKey: legacy.privateKey },
      nextKey: { keySuiteId: next.keySuiteId, privateKey: next.privateKey, keyVersion: 2 },
    })
    expect(rewrapped.wrappedVaultKey.descriptor).toMatchObject({
      wrapperSuiteId: KEY_WRAPPER_SUITE.active, recipientKeyVersion: 2, scope: memberScope,
      resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1,
    })
    const opened = await openMemberVaultKey(rewrapped, { keySuiteId: next.keySuiteId, privateKey: next.privateKey })
    expect(Array.from(opened)).toEqual(Array.from(vaultKey))
  })

  it('refuses an envelope scoped to another member', async () => {
    const sodium = await loadSodium()
    const legacy = sodium.crypto_box_keypair()
    const next = await generateRecipientKeyPair()
    const envelope = await legacyMemberEnvelope(sodium.randombytes_buf(32), legacy.publicKey)
    await expect(rewrapOwnMemberVaultKey({
      vault: { id: vaultId, organizationId, memberKeyGeneration: 1, memberVaultKey: envelope },
      memberId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      legacyKey: { keySuiteId: KEY_WRAPPER_SUITE.legacy, privateKey: legacy.privateKey },
      nextKey: { keySuiteId: next.keySuiteId, privateKey: next.privateKey, keyVersion: 2 },
    })).rejects.toThrow('does not match')
  })
})

describe('sealMemberVaultMetadata', () => {
  it('advances the authenticated revision without exposing metadata', async () => {
    const vaultKey = await (await loadSodium()).randombytes_buf(32)
    const organizationId = '00112233-4455-6677-8899-aabbccddeeff'
    const vaultId = '11112222-3333-4444-8555-666677778888'
    const descriptor = {
      protocolVersion: 2, cryptoSuiteId: 'palladin-vault-xchacha-v1',
      purpose: ENVELOPE_PURPOSE.memberVaultMetadata, scope: { organizationId, vaultId },
      resourceRevision: '4', keyVersion: 1, memberKeyGeneration: 2, binding: {},
    } as const
    const key = await deriveVaultSubkey(vaultKey, {
      protocolVersion: 2, cryptoSuiteId: VAULT_XCHACHA20_POLY1305_V1,
      purpose: descriptor.purpose, organizationId, vaultId, keyVersion: 1, memberKeyGeneration: 2,
    })
    const current = await sealVaultEnvelope(descriptor, encodeMemberVaultMetadata({
      schema: 'palladin.member-vault-metadata.v1', name: 'Old', description: null,
      icon: null, color: '#AABBCC', grantMode: 'granular',
    }), key)
    const next = await sealMemberVaultMetadata({ id: vaultId, organizationId, memberKeyGeneration: 2 }, current, {
      schema: 'palladin.member-vault-metadata.v1', name: 'New', description: null,
      icon: null, color: '#AABBCC', grantMode: 'granular',
    }, vaultKey)
    expect(next.descriptor.resourceRevision).toBe('5')
    expect(JSON.stringify(next)).not.toContain('New')
    wipe(key); wipe(vaultKey)
  })
})
