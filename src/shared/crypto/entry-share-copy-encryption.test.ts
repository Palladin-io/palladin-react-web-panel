import { beforeAll, describe, expect, it } from 'vitest'
import { createVaultProtocolPayload } from './create-vault-protocol'
import { openMemberVaultKey } from './vault-protocol'
import { openMemberSecret } from './entry-protocol'
import { deriveVaultSubkey } from './hkdf'
import { openVaultEnvelope } from './vault-envelope'
import { wipe } from './sodium'
import { entryShareCopySecret } from './entry-share-copy'
import { readEntryShareCopyVaultName, sealEntryShareCopy, type EntryShareCopyVault } from './entry-share-copy-encryption'
import type { EntryShareSnapshot } from './entry-share'
import fixture from './fixtures/entry-share-v1.json'

const authority = { organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
  memberId: '33333333-3333-4333-8333-333333333333', entryId: '44444444-4444-4444-8444-444444444444' }
const privateKey = new Uint8Array(32).fill(7)
let vault: EntryShareCopyVault
const secret = entryShareCopySecret(fixture.snapshot as EntryShareSnapshot, { title: 'Recipient copy', additions: {} })
beforeAll(async () => {
  const created = await createVaultProtocolPayload({ ...authority, memberKeyVersion: 1, memberPrivateKey: privateKey,
    metadata: { schema: 'palladin.member-vault-metadata.v1', name: 'Destination', description: null,
      icon: null, color: null, grantMode: 'granular' } })
  vault = { ...created, id: authority.vaultId, organizationId: authority.organizationId,
    memberVaultKey: created.creatorVaultKey, memberKeyGeneration: 1 }
})

describe('Received copy encryption in the selected Vault', () => {
  it('decrypts only locally, uses a fresh Entry key and never creates Discovery', async () => {
    const signal = new AbortController().signal
    expect(await readEntryShareCopyVaultName(vault, authority, privateKey, signal)).toBe('Destination')
    const first = await sealEntryShareCopy(secret, vault, authority, privateKey, signal)
    const second = await sealEntryShareCopy(secret, vault, authority, privateKey, signal)
    expect(first.agentDiscovery).not.toBeNull()
    expect(JSON.stringify(first)).not.toContain('fixture-only')
    const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
    const descriptor = first.entryKey.descriptor
    const wrappingKey = await deriveVaultSubkey(vaultKey, { protocolVersion: 2, cryptoSuiteId: descriptor.cryptoSuiteId,
      purpose: descriptor.purpose, organizationId: authority.organizationId, vaultId: authority.vaultId,
      entryId: authority.entryId, keyVersion: 1, memberKeyGeneration: 1 })
    const firstKey = await openVaultEnvelope(first.entryKey, wrappingKey, { wrappingVkVersion: 1 })
    const secondKey = await openVaultEnvelope(second.entryKey, wrappingKey, { wrappingVkVersion: 1 })
    try {
      expect(firstKey).not.toEqual(secondKey)
      expect(firstKey).not.toEqual(Uint8Array.from({ length: 32 }, (_, index) => index))
      expect(await openMemberSecret(first.entryKey, first.memberSecret, vaultKey, { ...authority, revision: '1' })).toEqual(secret)
      expect(first.memberSecret.descriptor.scope).toEqual({ organizationId: authority.organizationId,
        vaultId: authority.vaultId, entryId: authority.entryId })
    } finally { wipe(vaultKey); wipe(wrappingKey); wipe(firstKey); wipe(secondKey) }
  })

  it.each(['organizationId', 'vaultId', 'memberId'] as const)('rejects foreign selected %s authority', async (field) => {
    const foreign = { ...authority, [field]: '99999999-9999-4999-8999-999999999999' }
    await expect(sealEntryShareCopy(secret, vault, foreign, privateKey, new AbortController().signal)).rejects.toThrow()
  })

  it.each(['vaultKeyVersion', 'vdkVersion'] as const)('rejects a wrapper inconsistent with the authoritative %s', async (field) => {
    const wrong = { ...vault, currentKeyEpoch: { ...vault.currentKeyEpoch, [field]: 2 } }
    await expect(sealEntryShareCopy(secret, wrong, authority, privateKey, new AbortController().signal)).rejects.toThrow()
  })

  it('rejects substituted Discovery scope before using it', async () => {
    const wrong = structuredClone(vault)
    wrong.discoveryKey.descriptor.scope.vaultId = '99999999-9999-4999-8999-999999999999'
    await expect(sealEntryShareCopy(secret, wrong, authority, privateKey, new AbortController().signal)).rejects.toThrow()
  })

  it('does not start key use after cancellation', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(sealEntryShareCopy(secret, vault, authority, privateKey, controller.signal)).rejects.toThrow()
  })
})
