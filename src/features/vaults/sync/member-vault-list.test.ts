import { describe, expect, it } from 'vitest'
import { buildMemberVaultList, filterMemberVaults } from './member-vault-list'
import type { DecryptedMemberVault } from './member-sync-store'

function vault(
  vaultId: string,
  name: string | null,
  description: string | null = null,
  status: DecryptedMemberVault['status'] = 'ready',
): DecryptedMemberVault {
  return {
    vaultId,
    metadata: name === null ? null : { name, description: description ?? null,
      icon: { kind: 'glyph', value: 'lock' }, color: '#123456', grantMode: 'granular' },
    structure: {
      isDefault: false,
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
      memberCount: 2,
      entryCount: 3,
      activeGrantCount: 1,
    },
    entries: new Map(),
    appliedThroughSequence: '1',
    status,
    failureKind: name === null ? 'metadata' : null,
  }
}

describe('decrypted Member vault list', () => {
  it('projects only decrypted metadata and structural counters', () => {
    const item = buildMemberVaultList(new Map([
      ['vault-1', vault('vault-1', 'Personal', 'Private accounts')],
    ]))[0]

    expect(item).toEqual({
      id: 'vault-1',
      isDefault: false,
      name: 'Personal',
      description: 'Private accounts',
      icon: 'lock',
      color: '#123456',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
      entryCount: 3,
      activeGrantCount: 1,
      memberCount: 2,
      syncStatus: 'ready',
      failureKind: null,
    })
    expect(Object.keys(item)).not.toContain('ciphertext')
  })

  it('preserves the server-owned default Vault marker for deep-link routing', () => {
    const personal = vault('vault-personal', 'Personal')
    personal.structure.isDefault = true

    expect(buildMemberVaultList(new Map([
      ['vault-team', vault('vault-team', 'Team')],
      ['vault-personal', personal],
    ])).find((item) => item.isDefault)?.id).toBe('vault-personal')
  })

  it('searches decrypted names and descriptions locally with Unicode normalization', () => {
    const items = buildMemberVaultList(new Map([
      ['vault-1', vault('vault-1', 'Żółty', 'Production accounts')],
      ['vault-2', vault('vault-2', 'Family', 'Shared')],
    ]))

    expect(filterMemberVaults(items, 'ŻÓŁTY').map((item) => item.id)).toEqual(['vault-1'])
    expect(filterMemberVaults(items, 'production').map((item) => item.id)).toEqual(['vault-1'])
  })

  it('keeps a corrupt projection anonymous and visible while filtering', () => {
    const items = buildMemberVaultList(new Map([
      ['vault-1', vault('vault-1', null, null, 'error')],
      ['vault-2', vault('vault-2', 'Family')],
    ]))

    expect(filterMemberVaults(items, 'missing')).toEqual([expect.objectContaining({
      id: 'vault-1',
      name: null,
      description: null,
      syncStatus: 'error',
    })])
  })

  it('rejects decrypted presentation colors that are not canonical hex', () => {
    const unsafe = vault('vault-1', 'Personal')
    unsafe.metadata = { ...unsafe.metadata!, color: 'url(https://example.test)' }

    expect(buildMemberVaultList(new Map([['vault-1', unsafe]]))[0].color).toBeNull()
  })

  it('filters a large in-memory vault list within the render-search budget', () => {
    const source = new Map<string, DecryptedMemberVault>()
    for (let index = 0; index < 10_000; index += 1) {
      const id = `vault-${index}`
      source.set(id, vault(id, index === 9_999 ? 'Unique needle' : `Vault ${index}`))
    }

    const started = performance.now()
    const matches = filterMemberVaults(buildMemberVaultList(source), 'unique needle')

    expect(matches.map((item) => item.id)).toEqual(['vault-9999'])
    expect(performance.now() - started).toBeLessThan(200)
  })
})
