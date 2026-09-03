import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActiveCacheState, MemberSyncCache } from './member-sync-cache'
import { repairMemberSyncGeneration } from './member-sync-lifecycle'
import { useMemberSyncStore, type MemberIndexRecord } from './member-sync-store'

const vaultId = '22222222-2222-4222-8222-222222222222'
const userId = '11111111-1111-4111-8111-111111111111'
const entry: MemberIndexRecord = {
  entryId: '33333333-3333-4333-8333-333333333333',
  state: 'active',
  updatedAt: '2026-09-01T00:00:00Z',
  currentRevision: '1',
  memberIndexRevision: '1',
  currentKeyVersion: 1,
  payload: {
    schema: 'palladin.member-index.v1',
    entryType: 'credential',
    memberLabel: 'Visible while repairing',
    description: null,
    icon: null,
    color: null,
    username: null,
    urlDomain: null,
    customIndex: [],
  },
  corrupt: false,
}

function publishVault(): void {
  useMemberSyncStore.getState().publishVault({
    vaultId,
    metadata: { schema: 'palladin.member-vault-metadata.v1', name: 'Vault' },
    structure: {
      isDefault: false,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
      memberCount: 1,
      entryCount: 1,
      activeGrantCount: 0,
    },
    entries: new Map([[entry.entryId, entry]]),
    appliedThroughSequence: '1',
    status: 'ready',
    failureKind: null,
  })
}

function cacheWith(removed = true): MemberSyncCache {
  return {
    removeActiveGeneration: vi.fn(async () => removed),
  } as unknown as MemberSyncCache
}

describe('Member sync generation repair', () => {
  beforeEach(() => {
    useMemberSyncStore.getState().clear()
    publishVault()
  })

  it('rebuilds ciphertext while retaining the decrypted list projection', async () => {
    const active = { namespace: 'active' } as ActiveCacheState
    const cache = cacheWith()

    await expect(repairMemberSyncGeneration(userId, vaultId, active, cache)).resolves.toBe(true)

    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, active)
    expect(useMemberSyncStore.getState().vaults.get(vaultId)).toMatchObject({
      status: 'resetting',
      entries: new Map([[entry.entryId, entry]]),
    })
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
  })

  it('still requests a retry when another operation already replaced the generation', async () => {
    const failed = { namespace: 'old' } as ActiveCacheState
    const cache = cacheWith(false)

    await expect(repairMemberSyncGeneration(userId, vaultId, failed, cache)).resolves.toBe(false)

    expect(cache.removeActiveGeneration).toHaveBeenCalledWith(userId, vaultId, failed)
    expect(useMemberSyncStore.getState().vaults.get(vaultId)?.status).toBe('ready')
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
  })
})
