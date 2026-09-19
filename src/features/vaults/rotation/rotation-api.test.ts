import { describe, expect, it, vi } from 'vitest'
const apiMock = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({ api: apiMock }))
import { getRotationMembers, listPendingRotations, prepareRotationBatch } from './rotation-api'
const id = '11111111-1111-4111-8111-111111111111'
const signal = new AbortController().signal
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })

describe('rotation transport metadata', () => {
  it('accepts additive page and recipient metadata without weakening recipient keys', async () => {
    apiMock.get.mockResolvedValueOnce(response({ items: [{ memberId: id, recipientKeyVersion: 1,
      recipientKeyFingerprint: 'fingerprint', x25519PublicKey: 'public-key', displayHint: 'new' }],
      nextAfterId: null, futurePageHint: true }))
    await expect(getRotationMembers(id, id, id, null, signal)).resolves.toMatchObject({ items: [{ memberId: id }] })
  })
  it('accepts additive rotation and epoch fields', async () => {
    const epoch = { vaultKeyVersion: 1, vdkVersion: 1, agentMessageKeyVersion: 1, manifestSigningKeyVersion: 1, futureHint: true }
    apiMock.get.mockResolvedValueOnce(response({ items: [{ id, vaultId: id, status: 'pending', cause: 'manual', scope: [],
      baseMemberKeyGeneration: 1, targetMemberKeyGeneration: 2, baseKeyEpoch: epoch, targetKeyEpoch: epoch,
      baseMemberSequence: '1', baseDiscoverySequence: '1', leaseRevision: 0, leaseOwnerId: null, leaseExpiresAt: null,
      triggeredAt: '2026-09-19T00:00:00Z', committedAt: null, lastFailureCode: null, futureHint: true }], futurePageHint: true }))
    await expect(listPendingRotations(signal)).resolves.toMatchObject([{ id }])
  })
  it('does not impose business bounds on committed batch progress', async () => {
    apiMock.put.mockResolvedValueOnce(response({ acceptedItems: -1, totalPreparedItems: -1, futureHint: true }))
    await expect(prepareRotationBatch(id, id, id, {}, signal)).resolves.toMatchObject({ acceptedItems: -1, totalPreparedItems: -1 })
  })
  it('still rejects an invalid recipient key version before encryption', async () => {
    apiMock.get.mockResolvedValueOnce(response({ items: [{ memberId: id, recipientKeyVersion: -1,
      recipientKeyFingerprint: 'fingerprint', x25519PublicKey: 'public-key' }], nextAfterId: null }))
    await expect(getRotationMembers(id, id, id, null, signal)).rejects.toThrow()
  })
})
