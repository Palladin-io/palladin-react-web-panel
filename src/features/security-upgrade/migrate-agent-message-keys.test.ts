import { generateRecipientKeyPair, KEY_WRAPPER_SUITE } from '@palladin/crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createVaultProtocolPayload } from '../../shared/crypto/create-vault-protocol'
import { toBase64 } from '../../shared/crypto/encoding'
import { loadSodium } from '../../shared/crypto/sodium'
import { openVaultDerivedEnvelope, openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { verifyVaultSignature, type CanonicalJson } from '../../shared/crypto/vault-v2-signatures'
import { decodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { migrateVaultAgentMessageKey } from './migrate-agent-message-keys'

const api = vi.hoisted(() => ({ start: vi.fn(), claim: vi.fn(), agents: vi.fn(), batch: vi.fn(), commit: vi.fn(), vault: vi.fn() }))
vi.mock('../vaults/rotation/rotation-api', () => ({
  startAgentMessageKeyMigration: api.start, claimRotation: api.claim, getRotationAgents: api.agents,
  prepareRotationBatch: api.batch, commitRotation: api.commit,
  RotationHttpError: class extends Error { constructor(readonly status: number) { super(String(status)) } },
}))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: api.vault }))

const organizationId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'
const memberId = '33333333-3333-4333-8333-333333333333'
const signal = new AbortController().signal

describe('migrateVaultAgentMessageKey', () => {
  let memberKey: { keySuiteId: string; privateKey: Uint8Array }

  beforeEach(async () => {
    vi.clearAllMocks()
    const member = await generateRecipientKeyPair()
    memberKey = { keySuiteId: member.keySuiteId, privateKey: member.privateKey }
    const created = await createVaultProtocolPayload({
      organizationId, vaultId, memberId, memberKeyVersion: 2, memberKey,
      metadata: { schema: 'palladin.member-vault-metadata.v1', name: 'V', description: null, icon: null, color: null, grantMode: 'granular' },
    })
    api.vault.mockResolvedValue({
      id: vaultId, organizationId, memberKeyGeneration: 1, memberVaultKey: created.creatorVaultKey,
      discoveryKey: created.discoveryKey, vaultPrivateKeys: created.vaultPrivateKeys,
      currentKeyEpoch: created.currentKeyEpoch, vaultAgentMessageKeySuiteId: KEY_WRAPPER_SUITE.legacy,
    })
    api.start.mockResolvedValue({ id: 'rotation', targetKeyEpoch: { ...created.currentKeyEpoch, agentMessageKeyVersion: 2 } })
    api.claim.mockResolvedValue({ fencingToken: 'fence' })
    api.batch.mockResolvedValue({ acceptedItems: 1, totalPreparedItems: 1 })
    api.commit.mockResolvedValue(new Response(null, { status: 200 }))
  })

  it('publishes an X-Wing message key at version + 1 with successor manifests, skipping legacy Agents', async () => {
    const sodium = await loadSodium()
    const xwingAgent = await generateRecipientKeyPair()
    const legacyAgent = sodium.crypto_box_keypair()
    const signing = sodium.crypto_sign_keypair()
    api.agents.mockResolvedValue({ nextAfterId: null, items: [
      { agentId: '44444444-4444-4444-8444-444444444444', publicKey: toBase64(xwingAgent.publicKey), keySuiteId: xwingAgent.keySuiteId,
        ed25519PublicKey: toBase64(signing.publicKey), recipientKeyVersion: 1, manifestRevision: '3' },
      { agentId: '55555555-5555-4555-8555-555555555555', publicKey: toBase64(legacyAgent.publicKey), keySuiteId: KEY_WRAPPER_SUITE.legacy,
        ed25519PublicKey: toBase64(signing.publicKey), recipientKeyVersion: 1, manifestRevision: '3' },
    ] })

    await expect(migrateVaultAgentMessageKey({ id: vaultId }, memberKey, signal)).resolves.toBe('migrated')

    const [, , fence, batch] = api.batch.mock.calls[0]
    expect(fence).toBe('fence')
    expect(batch.vaultAgentMessagePublicKey).toMatchObject({ schemeId: KEY_WRAPPER_SUITE.active, keyKind: 'agentMessage', keyVersion: 2 })
    expect(batch.vaultPrivateKeys[0].descriptor).toMatchObject({ purpose: 3, keyVersion: 2, resourceRevision: '2', memberKeyGeneration: 1,
      binding: { wrappingVaultKeyVersion: 1 } })
    const vault = await api.vault()
    const vaultKey = await openMemberVaultKey(vault.memberVaultKey, memberKey)
    expect(await openVaultDerivedEnvelope(batch.vaultPrivateKeys[0], vaultKey)).toHaveLength(32)

    expect(batch.agentDiscoveries).toHaveLength(1)
    const { manifest } = batch.agentDiscoveries[0]
    expect(manifest).toMatchObject({ vaultAgentMessageKeySuiteId: KEY_WRAPPER_SUITE.active, agentMessageKeyVersion: 2,
      vaultAgentMessagePublicKey: batch.vaultAgentMessagePublicKey.encodedPublicKey })
    const { signature, ...unsigned } = manifest
    expect(await verifyVaultSignature('PLDNV2SIG:VAULT-MANIFEST:', unsigned as CanonicalJson, signature,
      decodeBase64Url(manifest.vaultSigningPublicKey, 32))).toBe(true)
    expect(api.commit).toHaveBeenCalledWith(vaultId, 'rotation', 'fence', signal)
  })

  it('does nothing when the Vault message key is already current', async () => {
    api.start.mockResolvedValueOnce(null)
    await expect(migrateVaultAgentMessageKey({ id: vaultId }, memberKey, signal)).resolves.toBe('current')
    expect(api.claim).not.toHaveBeenCalled()
    expect(api.batch).not.toHaveBeenCalled()
  })
})
