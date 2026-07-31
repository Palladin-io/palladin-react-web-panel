import { describe, expect, it } from 'vitest'
import { createInitialVaultMaterial } from './vault-v2-creation'
import { decryptMemberVaultMetadata, openMemberVaultKey } from './vault-v2-member-sync'
import { openDiscoveryKey, openVaultPrivateKey } from './vault-v2-rotation'
import { loadSodium, wipe } from './sodium'

describe('createInitialVaultMaterial', () => {
  it('creates a complete, decryptable protocol-2 Vault bootstrap without mutating the Member key', async () => {
    const sodium = await loadSodium()
    const member = sodium.crypto_box_keypair()
    const originalPrivateKey = new Uint8Array(member.privateKey)
    const organizationId = '11111111-1111-4111-8111-111111111111'
    const vaultId = '33333333-3333-4333-8333-333333333333'
    const memberId = '22222222-2222-4222-8222-222222222222'
    const metadata = {
      name: 'Production', description: 'Primary', iconReference: 'shield', color: 'red',
    }

    const created = await createInitialVaultMaterial({
      organizationId, vaultId, memberId, memberKeyVersion: 7,
      memberPrivateKey: member.privateKey, metadata,
    })

    expect(created.currentKeyEpoch).toEqual({
      vaultKeyVersion: 1, vdkVersion: 1, agentMessageKeyVersion: 1,
      manifestSigningKeyVersion: 1,
    })
    expect(created.creatorVaultKey.recipientMemberKeyVersion).toBe(7)
    expect(created.vaultPrivateKeys.map((key) => key.privateKeyKind)).toEqual([1, 2])
    expect(member.privateKey).toEqual(originalPrivateKey)

    const vaultKey = await openMemberVaultKey(created.creatorVaultKey, {
      organizationId, vaultId, memberId, vkVersion: 1, memberKeyGeneration: 1,
    }, member.privateKey)
    const discoveryKey = await openDiscoveryKey(created.discoveryKey, vaultKey)
    const privateKeys = await Promise.all(created.vaultPrivateKeys.map((key) => openVaultPrivateKey(key, vaultKey)))
    try {
      await expect(decryptMemberVaultMetadata(created.memberVaultMetadata, {
        organizationId, vaultId, keyVersion: 1, memberKeyGeneration: 1,
      }, vaultKey)).resolves.toEqual(metadata)
      expect(discoveryKey).toHaveLength(32)
      expect(privateKeys[0]).toHaveLength(32)
      expect(privateKeys[1]).toHaveLength(32)
    } finally {
      wipe(vaultKey)
      wipe(discoveryKey)
      privateKeys.forEach(wipe)
      wipe(originalPrivateKey)
      wipe(member.privateKey)
      wipe(member.publicKey)
    }
  })

  it('rejects an invalid Member key version before producing material', async () => {
    await expect(createInitialVaultMaterial({
      organizationId: 'org', vaultId: 'vault', memberId: 'member', memberKeyVersion: 0,
      memberPrivateKey: new Uint8Array(32), metadata: { name: 'Vault' },
    })).rejects.toThrow('Current Member key version is required')
  })
})
