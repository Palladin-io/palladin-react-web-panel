import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({ api: apiMock }))

import { getMemberSnapshotPage, memberSyncItemSchema } from './member-sync-api'

describe('Member sync transport boundary', () => {
  beforeEach(() => apiMock.post.mockReset())

  it('rejects a declared response above the hard byte budget before reading its body', async () => {
    const body = new ReadableStream()
    apiMock.post.mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
    }))

    await expect(getMemberSnapshotPage('22222222-2222-4222-8222-222222222222', null)).rejects.toThrow('hard byte limit')
  })

  it('rejects an EntryKey whose authenticated generation is inconsistent with MemberIndex', () => {
    const item = {
      entryId: '33333333-3333-4333-8333-333333333333', kind: 'head', state: 'active',
      updatedAt: '2026-07-26T12:00:00Z',
      currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 5,
      entryKey: {
        organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '33333333-3333-4333-8333-333333333333', wrapperRevision: '1', keyVersion: 5,
        memberKeyGeneration: 4, wrappingKeyVersion: 3, wrappedEntryDekByVk: 'ciphertext',
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 8, resourceRevision: '1', keyVersion: 5, memberKeyGeneration: 4, nonce: 'nonce' },
      },
      memberIndex: {
        organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '33333333-3333-4333-8333-333333333333', memberIndexRevision: '1', ciphertext: 'ciphertext',
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 2, resourceRevision: '1', keyVersion: 5, memberKeyGeneration: 3, nonce: 'nonce' },
      },
    }

    expect(memberSyncItemSchema.safeParse(item).success).toBe(false)
  })

  it('requires the structural update timestamp on Member heads and null on tombstones', () => {
    expect(memberSyncItemSchema.safeParse({
      entryId: '33333333-3333-4333-8333-333333333333', kind: 'tombstone', state: null,
      updatedAt: null, currentRevision: null, memberIndexRevision: null,
      currentKeyVersion: null, entryKey: null, memberIndex: null,
    }).success).toBe(true)
    expect(memberSyncItemSchema.safeParse({
      entryId: '33333333-3333-4333-8333-333333333333', kind: 'tombstone', state: null,
      currentRevision: null, memberIndexRevision: null,
      currentKeyVersion: null, entryKey: null, memberIndex: null,
    }).success).toBe(false)
  })
})
