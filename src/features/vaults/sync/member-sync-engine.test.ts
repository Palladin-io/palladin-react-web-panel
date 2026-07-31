import { beforeEach, describe, expect, it, vi } from 'vitest'

const cryptoProbe = vi.hoisted(() => ({ active: 0, maximum: 0, delay: false }))

vi.mock('../../../shared/crypto/vault-protocol', () => ({
  openVaultProjection: async () => ({ vaultKey: new Uint8Array(32), metadata: { name: 'Encrypted Vault' } }),
}))

vi.mock('../../../shared/crypto/entry-protocol', () => ({
  openMemberIndex: async (_entryKey: unknown, envelope: { testLabel?: string }) => {
    cryptoProbe.active += 1
    cryptoProbe.maximum = Math.max(cryptoProbe.maximum, cryptoProbe.active)
    if (cryptoProbe.delay) await new Promise((resolve) => setTimeout(resolve, 1))
    cryptoProbe.active -= 1
    return { memberLabel: envelope.testLabel ?? 'Entry', entryType: 1, searchFields: ['entry'] }
  },
}))

import type { EncryptedVaultSummary, MemberDeltaPage, MemberSnapshotPage, MemberSyncItem } from './member-sync-api'
import type { ActiveCacheState, CachedItemPage, MemberSyncCache } from './member-sync-cache'
import { MemberSyncEngine, type MemberSyncTransport } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'

const userId = '11111111-1111-4111-8111-111111111111'
const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const vaultId = '22222222-2222-4222-8222-222222222222'

function vault(): EncryptedVaultSummary {
  return {
    id: vaultId,
    memberSequence: '20',
    entryCount: 20,
    memberKeyGeneration: 4,
    currentKeyEpoch: { vaultKeyVersion: 3 },
    memberVaultMetadata: {},
    memberVaultKey: { wrappedVaultKey: { descriptor: { scope: { organizationId } } } },
  } as unknown as EncryptedVaultSummary
}

function head(index: number, revision = String(index + 1)): MemberSyncItem {
  const entryId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
  return {
    kind: 'head', entryId, state: 'active', currentRevision: revision,
    updatedAt: '2026-07-26T12:00:00Z',
    memberIndexRevision: revision, currentKeyVersion: 5,
    memberIndex: { testLabel: `Entry ${index}` }, entryKey: {},
  } as unknown as MemberSyncItem
}

function tombstone(item: MemberSyncItem): MemberSyncItem {
  return {
    kind: 'tombstone', entryId: item.entryId, state: null, currentRevision: null,
    updatedAt: null,
    memberIndexRevision: null, currentKeyVersion: null, memberIndex: null, entryKey: null,
  }
}

class RecordingCache implements MemberSyncCache {
  readonly events: string[] = []
  active: ActiveCacheState | null = null
  partialProjectionWasVisible = false
  activeReads = 0

  async getActiveState(): Promise<ActiveCacheState | null> { return this.active }
  async readActiveItemPage(): Promise<CachedItemPage> {
    this.activeReads += 1
    return { items: [], nextEntryId: null }
  }
  async beginSnapshot(_userId: string, _vault: EncryptedVaultSummary, _namespace: string, baseSequence: string): Promise<void> {
    this.events.push(`begin:${baseSequence}`)
  }
  async applySnapshotPage(_userId: string, _vaultId: string, _namespace: string, items: MemberSyncItem[]): Promise<void> {
    this.events.push(`snapshot:${items.length}`)
    this.partialProjectionWasVisible ||= useMemberSyncStore.getState().vaults.has(vaultId)
  }
  async applyPendingDeltaPage(_userId: string, _vaultId: string, _namespace: string, expected: string, page: MemberDeltaPage): Promise<void> {
    this.events.push(`delta:${expected}->${page.appliedThroughSequence}`)
    this.partialProjectionWasVisible ||= useMemberSyncStore.getState().vaults.has(vaultId)
  }
  async completeSnapshot(_userId: string, currentVault: EncryptedVaultSummary, namespace: string, sequence: string): Promise<void> {
    this.events.push(`complete:${sequence}`)
    this.active = { namespace, appliedThroughSequence: sequence, vault: currentVault }
  }
  async applyActiveDeltaPage(_userId: string, _vault: EncryptedVaultSummary, expected: string, page: MemberDeltaPage): Promise<void> {
    this.events.push(`active-delta:${expected}->${page.appliedThroughSequence}`)
  }
  async removeMissingVaults(): Promise<void> { this.events.push('retain') }
}

describe('Member sync engine', () => {
  beforeEach(() => {
    cryptoProbe.active = 0
    cryptoProbe.maximum = 0
    cryptoProbe.delay = false
    useMemberSyncStore.getState().clear()
  })

  it('builds a snapshot privately, applies the closing delta, then atomically publishes ready state', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => head(index))
    const secondPage = Array.from({ length: 8 }, (_, index) => head(index + 12))
    const replacement = head(20, '21')
    const snapshots: Record<string, MemberSnapshotPage> = {
      first: { snapshotBaseSequence: '18', items: firstPage, nextCursor: 'second' },
      second: { snapshotBaseSequence: '18', items: secondPage, nextCursor: null },
    }
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async (_vaultId, cursor) => snapshots[cursor ?? 'first'],
      delta: async () => ({
        deltaUpperBound: '20', appliedThroughSequence: '20', continuationCursor: null,
        items: [tombstone(firstPage[0]), replacement],
      }),
    }
    const cache = new RecordingCache()
    const engine = new MemberSyncEngine(cache, transport, async () => {})
    cryptoProbe.delay = true

    await engine.synchronize(userId, new Uint8Array(32), new AbortController().signal)

    expect(cache.events).toEqual(['retain', 'begin:18', 'snapshot:12', 'snapshot:8', 'delta:18->20', 'complete:20'])
    expect(cache.partialProjectionWasVisible).toBe(false)
    expect(cryptoProbe.maximum).toBeLessThanOrEqual(4)
    const projected = useMemberSyncStore.getState().vaults.get(vaultId)!
    expect(projected.status).toBe('ready')
    expect(projected.appliedThroughSequence).toBe('20')
    expect(projected.entries.has(firstPage[0].entryId)).toBe(false)
    expect(projected.entries.get(replacement.entryId)?.payload?.memberLabel).toBe('Entry 20')
  })

  it('does not activate a snapshot when the closing delta ends before its frozen upper bound', async () => {
    const cache = new RecordingCache()
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async () => ({ snapshotBaseSequence: '18', items: [head(1)], nextCursor: null }),
      delta: async () => ({ deltaUpperBound: '20', appliedThroughSequence: '19', continuationCursor: null, items: [] }),
    }

    await new MemberSyncEngine(cache, transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      new AbortController().signal,
    )

    expect(cache.events).not.toContain('complete:19')
    expect(cache.active).toBeNull()
    expect(useMemberSyncStore.getState().status).toBe('error')
  })

  it('keeps authenticated metadata distinct from a transient snapshot failure', async () => {
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async () => { throw new Error('temporary cache failure') },
      delta: async () => { throw new Error('unexpected delta') },
    }

    await new MemberSyncEngine(new RecordingCache(), transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      new AbortController().signal,
    )

    expect(useMemberSyncStore.getState().vaults.get(vaultId)).toMatchObject({
      metadata: { name: 'Encrypted Vault' },
      status: 'error',
      failureKind: 'sync',
    })
  })

  it('fails closed when an underreported account exceeds 10,000 actual projections', async () => {
    const cache = new RecordingCache()
    const underreported = { ...vault(), entryCount: 1 }
    const transport: MemberSyncTransport = {
      listVaults: async () => [underreported],
      snapshot: async (_vaultId, cursor) => {
        const page = Number(cursor ?? '0')
        const offset = page * 200
        const remaining = 10_001 - offset
        const count = Math.min(200, remaining)
        return {
          snapshotBaseSequence: '18',
          items: Array.from({ length: count }, (_, index) => head(offset + index)),
          nextCursor: remaining > 200 ? String(page + 1) : null,
        }
      },
      delta: async () => ({ deltaUpperBound: '18', appliedThroughSequence: '18', continuationCursor: null, items: [] }),
    }

    await new MemberSyncEngine(cache, transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      new AbortController().signal,
    )

    expect(cache.active).toBeNull()
    expect(cache.events.some((event) => event.startsWith('complete:'))).toBe(false)
    expect(useMemberSyncStore.getState().status).toBe('error')
  })

  it('reuses the aligned in-memory projection for a warm incremental poll', async () => {
    const currentVault = vault()
    const cachedEntry = head(1)
    const record = {
      entryId: cachedEntry.entryId, state: 'active' as const, currentRevision: '2', memberIndexRevision: '2',
      currentKeyVersion: 5, payload: { memberLabel: 'Cached', entryType: 1 as const, searchFields: ['cached'] }, corrupt: false,
    }
    useMemberSyncStore.getState().publishVault({
      vaultId, metadata: { name: 'Encrypted Vault' }, entries: new Map([[record.entryId, record]]),
      structure: {
        isDefault: false, createdAt: '', updatedAt: '', memberCount: 1, entryCount: 1, activeGrantCount: 0,
      },
      appliedThroughSequence: '20', status: 'ready', failureKind: null,
    })
    const cache = new RecordingCache()
    cache.active = { namespace: 'active', appliedThroughSequence: '20', vault: currentVault }
    const transport: MemberSyncTransport = {
      listVaults: async () => [currentVault],
      snapshot: async () => { throw new Error('unexpected snapshot') },
      delta: async () => ({ deltaUpperBound: '20', appliedThroughSequence: '20', continuationCursor: null, items: [] }),
    }

    await new MemberSyncEngine(cache, transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      new AbortController().signal,
    )

    expect(cache.activeReads).toBe(0)
    expect(cryptoProbe.maximum).toBe(0)
    expect(useMemberSyncStore.getState().vaults.get(vaultId)?.entries.get(record.entryId)?.payload?.memberLabel).toBe('Cached')
  })

  it('rejects a cycling snapshot cursor without activating partial data', async () => {
    const cache = new RecordingCache()
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async () => ({ snapshotBaseSequence: '18', items: [head(1)], nextCursor: 'same' }),
      delta: async () => { throw new Error('unexpected delta') },
    }

    await new MemberSyncEngine(cache, transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      new AbortController().signal,
    )

    expect(cache.active).toBeNull()
    expect(useMemberSyncStore.getState().status).toBe('error')
  })

  it('does not republish decrypted snapshot state after lock aborts an IndexedDB commit', async () => {
    let enteredCommit!: () => void
    let releaseCommit!: () => void
    const entered = new Promise<void>((resolve) => { enteredCommit = resolve })
    const release = new Promise<void>((resolve) => { releaseCommit = resolve })
    class PausingCache extends RecordingCache {
      override async completeSnapshot(
        currentUserId: string,
        currentVault: EncryptedVaultSummary,
        namespace: string,
        sequence: string,
      ): Promise<void> {
        enteredCommit()
        await release
        await super.completeSnapshot(currentUserId, currentVault, namespace, sequence)
      }
    }
    const cache = new PausingCache()
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async () => ({ snapshotBaseSequence: '18', items: [head(1)], nextCursor: null }),
      delta: async () => ({ deltaUpperBound: '18', appliedThroughSequence: '18', continuationCursor: null, items: [] }),
    }
    const controller = new AbortController()
    const synchronization = new MemberSyncEngine(cache, transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      controller.signal,
    )
    await entered

    controller.abort()
    useMemberSyncStore.getState().clear()
    releaseCommit()

    await expect(synchronization).rejects.toMatchObject({ name: 'AbortError' })
    expect(useMemberSyncStore.getState().vaults.has(vaultId)).toBe(false)
  })
})
