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

import {
  MemberSyncAccessDeniedError,
  type EncryptedVaultSummary,
  type MemberDeltaPage,
  type MemberSnapshotPage,
  type MemberSyncItem,
} from './member-sync-api'
import type {
  ActiveCacheState,
  CachedCurrentMemberEntry,
  CachedItemPage,
  MemberSyncCache,
} from './member-sync-cache'
import { MemberSyncEngine, type MemberSyncTransport } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'
import validSnapshotFixture from './__fixtures__/cvt-557-valid-snapshot.json'

const userId = '44444444-4444-4444-8444-444444444444'
const vaultId = '22222222-2222-4222-8222-222222222222'
const authority = {
  accessContext: validSnapshotFixture.response.accessContext,
  memberVaultKey: validSnapshotFixture.response.memberVaultKey,
}

function vault(): EncryptedVaultSummary {
  return {
    id: vaultId,
    memberSequence: '20',
    entryCount: 20,
    memberKeyGeneration: 4,
    currentKeyEpoch: { vaultKeyVersion: 3 },
    memberVaultMetadata: {},
    memberVaultKey: validSnapshotFixture.response.memberVaultKey,
  } as unknown as EncryptedVaultSummary
}

function head(index: number, revision = String(index + 1)): MemberSyncItem {
  const entryId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
  return {
    kind: 'head', entryId, state: 'active', currentRevision: revision,
    updatedAt: '2026-07-26T12:00:00Z',
    memberIndexRevision: revision, currentKeyVersion: 5,
    memberIndex: { testLabel: `Entry ${index}` }, memberSecret: {}, entryKey: {},
  } as unknown as MemberSyncItem
}

function tombstone(item: MemberSyncItem): MemberSyncItem {
  return {
    kind: 'tombstone', entryId: item.entryId, state: null, currentRevision: null,
    updatedAt: null,
    memberIndexRevision: null, currentKeyVersion: null, memberIndex: null,
    memberSecret: null, entryKey: null,
  }
}

function snapshotPage(
  snapshotBaseSequence: string,
  items: MemberSyncItem[],
  nextCursor: string | null = null,
): MemberSnapshotPage {
  return { ...authority, snapshotBaseSequence, items, nextCursor } as MemberSnapshotPage
}

function deltaPage(
  deltaUpperBound: string,
  appliedThroughSequence: string,
  items: MemberSyncItem[] = [],
  continuationCursor: string | null = null,
): MemberDeltaPage {
  return {
    ...authority, deltaUpperBound, appliedThroughSequence, items, continuationCursor,
  } as MemberDeltaPage
}

class RecordingCache implements MemberSyncCache {
  readonly events: string[] = []
  active: ActiveCacheState | null = null
  partialProjectionWasVisible = false
  activeReads = 0

  async getActiveState(): Promise<ActiveCacheState | null> { return this.active }
  async listActiveStates(): Promise<ActiveCacheState[]> { return this.active ? [this.active] : [] }
  async readActiveItem(): Promise<CachedCurrentMemberEntry | null> { return null }
  async readActiveItemPage(): Promise<CachedItemPage> {
    this.activeReads += 1
    return { items: [], nextEntryId: null }
  }
  async beginSnapshot(_userId: string, _vault: EncryptedVaultSummary, _namespace: string, baseSequence: string): Promise<void> {
    this.events.push(`begin:${baseSequence}`)
  }
  async applySnapshotPage(_userId: string, _vaultId: string, _namespace: string, page: MemberSnapshotPage): Promise<void> {
    this.events.push(`snapshot:${page.items.length}`)
    this.partialProjectionWasVisible ||= useMemberSyncStore.getState().vaults.has(vaultId)
  }
  async applyPendingDeltaPage(_userId: string, _vaultId: string, _namespace: string, expected: string, page: MemberDeltaPage): Promise<void> {
    this.events.push(`delta:${expected}->${page.appliedThroughSequence}`)
    this.partialProjectionWasVisible ||= useMemberSyncStore.getState().vaults.has(vaultId)
  }
  async completeSnapshot(_userId: string, currentVault: EncryptedVaultSummary, namespace: string, sequence: string): Promise<void> {
    this.events.push(`complete:${sequence}`)
    this.active = { namespace, appliedThroughSequence: sequence, vault: currentVault, authority }
  }
  async applyActiveDeltaPage(_userId: string, _vault: EncryptedVaultSummary, expected: string, page: MemberDeltaPage): Promise<void> {
    this.events.push(`active-delta:${expected}->${page.appliedThroughSequence}`)
  }
  async validateAndObserveActiveClock(
    _userId: string,
    _vaultId: string,
    _namespace: string,
    _currentWallTime: number,
    candidateMaximumWallTime: number,
  ): Promise<number> { return candidateMaximumWallTime }
  async removeVault(): Promise<void> { this.active = null; this.events.push('remove-vault') }
  async removeUser(): Promise<void> { this.active = null; this.events.push('remove-user') }
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
      first: snapshotPage('18', firstPage, 'second'),
      second: snapshotPage('18', secondPage),
    }
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async (_vaultId, cursor) => snapshots[cursor ?? 'first'],
      delta: async () => deltaPage('20', '20', [tombstone(firstPage[0]), replacement]),
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
      snapshot: async () => snapshotPage('18', [head(1)]),
      delta: async () => deltaPage('20', '19'),
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

  it('purges ciphertext and decrypted state immediately on connected access denial', async () => {
    const cache = new RecordingCache()
    const transport: MemberSyncTransport = {
      listVaults: async () => [vault()],
      snapshot: async () => { throw new MemberSyncAccessDeniedError() },
      delta: async () => { throw new Error('unexpected delta') },
    }

    await new MemberSyncEngine(cache, transport, async () => {}).synchronize(
      userId,
      new Uint8Array(32),
      new AbortController().signal,
    )

    expect(cache.events).toContain('remove-vault')
    expect(useMemberSyncStore.getState().vaults.has(vaultId)).toBe(false)
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
        return snapshotPage(
          '18',
          Array.from({ length: count }, (_, index) => head(offset + index)),
          remaining > 200 ? String(page + 1) : null,
        )
      },
      delta: async () => deltaPage('18', '18'),
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
    cache.active = { namespace: 'active', appliedThroughSequence: '20', vault: currentVault, authority }
    const transport: MemberSyncTransport = {
      listVaults: async () => [currentVault],
      snapshot: async () => { throw new Error('unexpected snapshot') },
      delta: async () => deltaPage('20', '20'),
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
      snapshot: async () => snapshotPage('18', [head(1)], 'same'),
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
      snapshot: async () => snapshotPage('18', [head(1)]),
      delta: async () => deltaPage('18', '18'),
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
