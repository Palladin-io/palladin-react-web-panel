import { afterEach, describe, expect, it } from 'vitest'
import { useAuthStore } from '../auth'
import { globalEntries, useGlobalEntriesUi } from './global-entries-model'
import type { DecryptedMemberVault, MemberIndexRecord } from './sync/member-sync-store'

function entry(id: string, label: string, type = 0): MemberIndexRecord {
  return {
    entryId: id, state: 'active', updatedAt: '2026-09-20T00:00:00Z',
    currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1,
    corrupt: false,
    payload: { memberLabel: label, entryType: type, description: null, icon: null,
      color: null, username: null, urlDomain: null, customIndex: [] },
  }
}

function vault(id: string, entries: MemberIndexRecord[]): DecryptedMemberVault {
  return {
    vaultId: id,
    metadata: { name: id, description: null, icon: null, color: null, grantMode: 'granular' },
    structure: { isDefault: false, createdAt: '', updatedAt: '', memberCount: 1,
      entryCount: entries.length, activeGrantCount: 0 },
    entries: new Map(entries.map((item) => [item.entryId, item])),
    appliedThroughSequence: '1', status: 'ready', failureKind: null,
  }
}

function project(vaults: DecryptedMemberVault[], query = '') {
  return globalEntries(new Map(vaults.map((item) => [item.vaultId, item])), query)
}

afterEach(() => useAuthStore.setState({ isVaultLocked: true }))

describe('global Entries projection', () => {
  it('combines active entries with explicit Vault context and deterministic alphabetical order', () => {
    const items = project([
      vault('Work', [entry('shared', 'Zulu'), { ...entry('archived', 'Archive'), state: 'archived' }]),
      vault('Personal', [entry('shared', 'Alpha'), { ...entry('deleted', 'Deleted'), state: 'deleted' }]),
    ])
    expect(items.map(({ id, vaultId, label }) => [id, vaultId, label])).toEqual([
      ['shared', 'Personal', 'Alpha'], ['shared', 'Work', 'Zulu'],
    ])
  })

  it('applies local normalized search across all Vaults and types', () => {
    const data = [vault('A', [entry('a', 'Café', 1), entry('b', 'Café', 0)]), vault('B', [entry('c', 'Café', 1)])]
    expect(project(data, ' CAFE\u0301 ').map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('excludes resetting Vaults and isolates corrupt entries without leaking their presentation', () => {
    const corrupt = { ...entry('12345678-1234-1234-1234-123456789012', 'Do not display'), corrupt: true }
    const items = project([{ ...vault('Reset', [entry('hidden', 'Hidden')]), status: 'resetting' }, vault('Ready', [corrupt, entry('ok', 'Visible')])])
    expect(items).toHaveLength(2)
    expect(items.find((item) => item.corrupt)).toMatchObject({ searchFields: [], icon: null })
    expect(items.some((item) => item.label === 'Do not display')).toBe(false)
    expect(project([vault('Ready', [corrupt])], 'Do not display')).toEqual([])
  })

  it('does not truncate the complete 10,000-head index to the search suggestion limit', () => {
    const data = Array.from({ length: 10 }, (_, group) => vault(String(group),
      Array.from({ length: 1000 }, (_, index) => entry(String(index), `Entry ${group}-${index}`))))
    expect(project(data)).toHaveLength(10_000)
    expect(project(data, 'Entry 9-999')).toHaveLength(1)
  })

  it('clears search and scroll when the unlocked session is invalidated', () => {
    useAuthStore.setState({ isVaultLocked: false })
    useGlobalEntriesUi.setState({ query: 'private query', scrollTop: 500, renderLimit: 300 })
    useAuthStore.setState({ isVaultLocked: true })
    expect(useGlobalEntriesUi.getState()).toMatchObject({ query: '', scrollTop: 0, renderLimit: 100 })
  })
})
