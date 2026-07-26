import { beforeEach, describe, expect, it } from 'vitest'
import { searchMemberIndex, useMemberSyncStore, type MemberIndexRecord } from './member-sync-store'

describe('in-memory Member index search', () => {
  beforeEach(() => useMemberSyncStore.getState().clear())

  it('finds the correct record across 10,000 encrypted-cache projections within the frozen local budget', () => {
    const entries = new Map<string, MemberIndexRecord>()
    for (let index = 0; index < 10_000; index += 1) {
      const entryId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
      entries.set(entryId, {
        entryId, state: 'active', currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
        payload: { memberLabel: index === 9_999 ? 'Unique Palladin Needle' : `Entry ${index}`, entryType: 1, searchFields: [`tag-${index}`] },
        corrupt: false,
      })
    }
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222', metadata: { name: 'Vault' }, entries,
      appliedThroughSequence: '1', status: 'ready',
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
      payload: { memberLabel: 'Original', entryType: 1, searchFields: [] }, corrupt: false,
    }
    useMemberSyncStore.getState().publishVault({
      vaultId: '22222222-2222-4222-8222-222222222222', metadata: { name: 'Vault' },
      entries: new Map([[original.entryId, original]]), appliedThroughSequence: '1', status: 'ready',
    })
    const optimistic = { ...original, memberIndexRevision: '3', currentRevision: '3', payload: { ...original.payload!, memberLabel: 'Optimistic' } }

    useMemberSyncStore.getState().reconcileEntry('22222222-2222-4222-8222-222222222222', optimistic)
    useMemberSyncStore.getState().reconcileEntry('22222222-2222-4222-8222-222222222222', { ...original, memberIndexRevision: '2' })

    expect(searchMemberIndex('optimistic')[0]?.memberIndexRevision).toBe('3')
  })
})
