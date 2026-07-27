import { beforeEach, describe, expect, it } from 'vitest'
import type { EncryptedVaultSummary } from './member-sync-api'
import { searchMemberIndex, useMemberSyncStore, type MemberIndexRecord } from './member-sync-store'

const structure = {
  isDefault: false,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-02T00:00:00Z',
  memberCount: 2,
  entryCount: 10_000,
  activeGrantCount: 1,
}

describe('in-memory Member index search', () => {
  beforeEach(() => useMemberSyncStore.getState().clear())

  it('finds the correct record across 10,000 encrypted-cache projections within the frozen local budget', () => {
    const entries = new Map<string, MemberIndexRecord>()
    for (let index = 0; index < 10_000; index += 1) {
      const entryId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
      entries.set(entryId, {
        entryId, state: 'active', currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
        payload: { memberLabel: index === 9_999 ? 'Unique Palladin Needle' : `Entry ${index}`, entryType: 'credential',
          description: null, icon: null, color: null, username: null, urlDomain: null,
          customIndex: [{ id: `tag-${index}`, label: `tag-${index}`, value: `tag-${index}` }] },
        corrupt: false,
      })
    }
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222', metadata: { name: 'Vault' }, entries,
      structure, appliedThroughSequence: '1', status: 'ready', failureKind: null,
    })

    const started = performance.now()
    const matches = searchMemberIndex('palladin needle')
    const elapsed = performance.now() - started

    expect(matches.map((entry) => entry.payload?.memberLabel)).toEqual(['Unique Palladin Needle'])
    expect(elapsed).toBeLessThan(200)
  })

  it('reconciles an optimistic projection without allowing an older delta result to replace it', () => {
    const original: MemberIndexRecord = {
      entryId: '33333333-3333-4333-8333-333333333333', state: 'active', currentRevision: '1',
      memberIndexRevision: '1', currentKeyVersion: 1,
      payload: { memberLabel: 'Original', entryType: 'credential', description: null, icon: null,
        color: null, username: null, urlDomain: null, customIndex: [] }, corrupt: false,
    }
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222', metadata: { name: 'Vault' },
      structure, entries: new Map([[original.entryId, original]]), appliedThroughSequence: '1', status: 'ready', failureKind: null,
    })
    const optimistic = { ...original, memberIndexRevision: '3', currentRevision: '3', payload: { ...original.payload!, memberLabel: 'Optimistic' } }

    useMemberSyncStore.getState().reconcileEntry('22222222-2222-4222-8222-222222222222', optimistic)
    useMemberSyncStore.getState().reconcileEntry('22222222-2222-4222-8222-222222222222', { ...original, memberIndexRevision: '2' })

    expect(searchMemberIndex('optimistic')[0]?.memberIndexRevision).toBe('3')
  })

  it('clears all decrypted presentation state on lock', () => {
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222',
      metadata: { name: 'Private vault' },
      structure,
      entries: new Map(),
      appliedThroughSequence: '1',
      status: 'ready',
      failureKind: null,
    })

    useMemberSyncStore.getState().clear()

    expect(useMemberSyncStore.getState().status).toBe('idle')
    expect(useMemberSyncStore.getState().vaults.size).toBe(0)
  })

  it('marks a retained vault as resetting without discarding its complete view', () => {
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222',
      metadata: { name: 'Private vault' },
      structure,
      entries: new Map(),
      appliedThroughSequence: '1',
      status: 'ready',
      failureKind: null,
    })

    useMemberSyncStore.getState().resetVault('22222222-2222-4222-8222-222222222222')

    expect(useMemberSyncStore.getState().vaults.get('22222222-2222-4222-8222-222222222222')).toMatchObject({
      metadata: { name: 'Private vault' },
      status: 'resetting',
    })
  })

  it('creates an anonymous corrupt row when metadata cannot be decrypted', () => {
    useMemberSyncStore.getState().failVault({
      id: '22222222-2222-4222-8222-222222222222',
      memberSequence: '7',
      ...structure,
    } as unknown as EncryptedVaultSummary, 'metadata')

    expect(useMemberSyncStore.getState().vaults.get('22222222-2222-4222-8222-222222222222')).toMatchObject({
      metadata: null,
      entries: new Map(),
      appliedThroughSequence: '7',
      status: 'error',
      failureKind: 'metadata',
    })
  })

  it('preserves authenticated metadata for a transient synchronization failure', () => {
    useMemberSyncStore.getState().failVault({
      id: '22222222-2222-4222-8222-222222222222',
      memberSequence: '7',
      ...structure,
    } as unknown as EncryptedVaultSummary, 'sync', { name: 'Verified vault' })

    expect(useMemberSyncStore.getState().vaults.get('22222222-2222-4222-8222-222222222222')).toMatchObject({
      metadata: { name: 'Verified vault' },
      status: 'error',
      failureKind: 'sync',
    })
  })

  it('signals retries with a monotonic generation', () => {
    useMemberSyncStore.getState().fail()

    useMemberSyncStore.getState().retry()

    expect(useMemberSyncStore.getState()).toMatchObject({
      retryGeneration: 1,
      error: 'member-sync-failed',
    })
  })
})
