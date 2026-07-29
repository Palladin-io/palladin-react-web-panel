import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import type { DecryptedMemberVault, MemberIndexRecord } from './member-sync-store'
import { buildMemberEntryList, filterAndSortMemberEntries } from './member-entry-list'

function record(index: number): MemberIndexRecord {
  const entryId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
  return {
    entryId,
    state: index % 3 === 0 ? 'archived' : 'active',
    currentRevision: '1',
    memberIndexRevision: '1',
    currentKeyVersion: 1,
    payload: {
      memberLabel: index === 9_998 ? 'Unique Needle' : `Entry ${index}`,
      entryType: index % 2 === 0 ? ENTRY_TYPE_KEY : ENTRY_TYPE_CREDENTIAL,
      description: null, icon: null, color: null, username: null, urlDomain: null,
      customIndex: [{ id: `field-${index}`, label: `field-${index}`, value: `field-${index}` }],
    },
    corrupt: false,
  }
}

describe('member entry list', () => {
  it('filters and sorts 10,000 in-memory records within the frozen local budget', () => {
    const entries = new Map<string, MemberIndexRecord>()
    for (let index = 0; index < 10_000; index += 1) {
      const entry = record(index)
      entries.set(entry.entryId, entry)
    }
    const started = performance.now()
    const projected = buildMemberEntryList({ entries } as DecryptedMemberVault)
    const matches = filterAndSortMemberEntries(projected, 'active', 'unique needle', 'name-asc')
    const elapsed = performance.now() - started

    expect(matches.map((entry) => entry.label)).toEqual(['Unique Needle'])
    expect(elapsed).toBeLessThan(200)
  })

  it('keeps corrupt records anonymous and searchable by shortened opaque id', () => {
    const corrupt = record(1)
    corrupt.payload = null
    corrupt.corrupt = true
    const projected = buildMemberEntryList({ entries: new Map([[corrupt.entryId, corrupt]]) } as DecryptedMemberVault)

    expect(projected[0].label).toMatch(/^33333333…/)
    expect(filterAndSortMemberEntries(projected, 'active', '33333333', 'name-asc')).toHaveLength(1)
  })

  it('preserves an explicit website icon, derives legacy icons, and preserves a manual glyph', () => {
    const legacy = record(1)
    legacy.payload = { ...legacy.payload!, urlDomain: 'discord.com', icon: null }
    const manual = record(2)
    manual.payload = {
      ...manual.payload!,
      urlDomain: 'binance.com',
      icon: { kind: 'glyph', value: 'key' },
    }
    const explicit = record(3)
    explicit.payload = {
      ...explicit.payload!,
      urlDomain: null,
      icon: { kind: 'website', hostname: 'cryptolume.co' },
    }

    const projected = buildMemberEntryList({
      entries: new Map([
        [legacy.entryId, legacy],
        [manual.entryId, manual],
        [explicit.entryId, explicit],
      ]),
    } as DecryptedMemberVault)

    expect(projected.find((entry) => entry.id === legacy.entryId)?.icon).toBe('website:discord.com')
    expect(projected.find((entry) => entry.id === manual.entryId)?.icon).toBe('key')
    expect(projected.find((entry) => entry.id === explicit.entryId)?.icon).toBe('website:cryptolume.co')
  })
})
