import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listPendingRotations: vi.fn(), claimRotation: vi.fn(), prepareRotationBatch: vi.fn(), commitRotation: vi.fn(),
  getRotationMembers: vi.fn(), getRotationEntryKeys: vi.fn(), getRotationDiscoveries: vi.fn(),
  getRotationAgents: vi.fn(), getVaultMetadata: vi.fn(), openMemberVaultKey: vi.fn(),
  openDiscoveryKey: vi.fn(), openVaultPrivateKey: vi.fn(), createDiscoveryKeyEnvelope: vi.fn(),
  createPrivateKeyEnvelope: vi.fn(), generateRotationKeys: vi.fn(), rotateDiscovery: vi.fn(),
  createAgentDiscoveryMaterial: vi.fn(), rewrapEntryKey: vi.fn(), rotateVaultMetadata: vi.fn(),
  sealMemberVaultKey: vi.fn(),
}))

vi.mock('./rotation-api', () => mocks)
vi.mock('../../../shared/crypto/vault-v2-member-sync', () => ({ openMemberVaultKey: mocks.openMemberVaultKey }))
vi.mock('../../../shared/crypto/vault-v2-rotation', () => ({
  openDiscoveryKey: mocks.openDiscoveryKey, openVaultPrivateKey: mocks.openVaultPrivateKey,
  createDiscoveryKeyEnvelope: mocks.createDiscoveryKeyEnvelope, createPrivateKeyEnvelope: mocks.createPrivateKeyEnvelope,
  generateRotationKeys: mocks.generateRotationKeys, rotateDiscovery: mocks.rotateDiscovery,
  createAgentDiscoveryMaterial: mocks.createAgentDiscoveryMaterial, rewrapEntryKey: mocks.rewrapEntryKey,
  rotateVaultMetadata: mocks.rotateVaultMetadata, sealMemberVaultKey: mocks.sealMemberVaultKey,
}))

import { VaultRotationEngine } from './rotation-engine'
import { useRotationStore } from './rotation-store'

const rotation = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', vaultId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  status: 'PendingClient', cause: 'AgentDeactivationRequested', scope: ['Vdk'],
  baseMemberKeyGeneration: 4, targetMemberKeyGeneration: 4,
  baseKeyEpoch: { vaultKeyVersion: 3, vdkVersion: 5, agentMessageKeyVersion: 7, manifestSigningKeyVersion: 9 },
  targetKeyEpoch: { vaultKeyVersion: 3, vdkVersion: 6, agentMessageKeyVersion: 7, manifestSigningKeyVersion: 9 },
  baseMemberSequence: '10', baseDiscoverySequence: '11', leaseRevision: 0,
  leaseOwnerId: null, leaseExpiresAt: null, triggeredAt: '2026-07-26T03:00:00Z', committedAt: null, lastFailureCode: null,
}
const currentMemberVaultKey = { organizationId: '11111111-1111-4111-8111-111111111111', vaultId: rotation.vaultId,
  memberId: '22222222-2222-4222-8222-222222222222', vkVersion: 3, memberKeyGeneration: 4 }
const baseClaim = { rotation, fencingToken: '33333333-3333-4333-8333-333333333333', currentMemberVaultKey,
  currentDiscoveryKey: { id: 'current-vdk' }, currentVaultPrivateKeys: [{ privateKeyKind: 1 }, { privateKeyKind: 2 }],
  pendingMemberVaultKey: null, pendingDiscoveryKey: null, pendingVaultPrivateKeys: [], preparedMaterialReset: false }

describe('VaultRotationEngine', () => {
  let generated: { vaultKey: Uint8Array; vdk: Uint8Array; agentMessagePrivateKey: Uint8Array; manifestSigningSeed: Uint8Array }

  beforeEach(() => {
    vi.restoreAllMocks()
    for (const mock of Object.values(mocks)) mock.mockReset()
    useRotationStore.getState().clear()
    generated = { vaultKey: new Uint8Array(32).fill(1), vdk: new Uint8Array(32).fill(2),
      agentMessagePrivateKey: new Uint8Array(32).fill(3), manifestSigningSeed: new Uint8Array(32).fill(4) }
    mocks.generateRotationKeys.mockResolvedValue(generated)
    mocks.listPendingRotations.mockResolvedValue([rotation])
    mocks.claimRotation.mockResolvedValue(baseClaim)
    mocks.openMemberVaultKey.mockResolvedValue(new Uint8Array(32).fill(5))
    mocks.openDiscoveryKey.mockResolvedValue(new Uint8Array(32).fill(6))
    mocks.openVaultPrivateKey.mockImplementation(async (envelope: { privateKeyKind: number }) => new Uint8Array(32).fill(envelope.privateKeyKind + 6))
    mocks.createDiscoveryKeyEnvelope.mockResolvedValue({ id: 'pending-vdk' })
    mocks.createPrivateKeyEnvelope.mockResolvedValue({})
    mocks.prepareRotationBatch.mockResolvedValue({ acceptedItems: 1, totalPreparedItems: 1 })
    mocks.rotateDiscovery.mockImplementation(async (source: { entryId: string }) => ({ entryId: source.entryId }))
    mocks.createAgentDiscoveryMaterial.mockImplementation(async (agent: { agentId: string }) => ({ agentId: agent.agentId }))
    mocks.commitRotation.mockResolvedValue(new Response('{}', { status: 200 }))
  })

  it('processes Discovery and Agent sources one bounded page at a time and wipes generated secrets', async () => {
    mocks.getRotationDiscoveries
      .mockResolvedValueOnce({ items: [{ sourceRevision: '1', envelope: { entryId: 'e1' } }, { sourceRevision: '2', envelope: { entryId: 'e2' } }], nextAfterId: 'e2' })
      .mockResolvedValueOnce({ items: [{ sourceRevision: '3', envelope: { entryId: 'e3' } }], nextAfterId: null })
    mocks.getRotationAgents
      .mockResolvedValueOnce({ items: [{ agentId: 'a1' }, { agentId: 'a2' }], nextAfterId: 'a2' })
      .mockResolvedValueOnce({ items: [{ agentId: 'a3' }], nextAfterId: null })

    await new VaultRotationEngine().run(currentMemberVaultKey.memberId, new Uint8Array(32), new AbortController().signal)

    expect(mocks.getRotationDiscoveries).toHaveBeenCalledTimes(2)
    expect(mocks.getRotationAgents).toHaveBeenCalledTimes(2)
    const batches = mocks.prepareRotationBatch.mock.calls.map((call) => call[3])
    expect(batches.filter((batch) => batch.entryDiscoveries).map((batch) => batch.entryDiscoveries.length)).toEqual([2, 1])
    expect(batches.filter((batch) => batch.agentDiscoveries).map((batch) => batch.agentDiscoveries.length)).toEqual([2, 1])
    expect(mocks.commitRotation).toHaveBeenCalledOnce()
    expect(useRotationStore.getState().phase).toBe('idle')
    for (const secret of Object.values(generated)) expect(Array.from(secret).every((value) => value === 0)).toBe(true)
  })

  it('fails closed when another device replaces the pending seed before lease renewal', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(60_000)
    mocks.claimRotation
      .mockResolvedValueOnce(baseClaim)
      .mockResolvedValueOnce({ ...baseClaim, fencingToken: '44444444-4444-4444-8444-444444444444', pendingDiscoveryKey: { id: 'foreign-vdk' } })
    mocks.openDiscoveryKey.mockImplementation(async (envelope: { id: string }) =>
      new Uint8Array(32).fill(envelope.id === 'foreign-vdk' ? 99 : 6))

    await expect(new VaultRotationEngine().run(currentMemberVaultKey.memberId, new Uint8Array(32), new AbortController().signal))
      .rejects.toThrow('rotation-seed-changed')

    expect(mocks.commitRotation).not.toHaveBeenCalled()
    for (const secret of Object.values(generated)) expect(Array.from(secret).every((value) => value === 0)).toBe(true)
  })
})
