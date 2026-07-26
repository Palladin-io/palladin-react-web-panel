import { beforeEach, describe, expect, it, vi } from 'vitest'

const cryptoProbe = vi.hoisted(() => ({ active: 0, maximum: 0 }))

vi.mock('../../../shared/crypto/vault-v2-member-sync', () => ({
  openMemberVaultKey: async () => new Uint8Array(32),
  decryptMemberVaultMetadata: async () => ({ name: 'Encrypted Vault' }),
  decryptMemberIndex: async (envelope: { testLabel?: string }) => {
    cryptoProbe.active += 1
    cryptoProbe.maximum = Math.max(cryptoProbe.maximum, cryptoProbe.active)
    await new Promise((resolve) => setTimeout(resolve, 1))
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
    memberKeyGeneration: 4,
    currentKeyEpoch: { vaultKeyVersion: 3 },
    memberVaultMetadata: {},
    memberVaultKey: { organizationId },
  } as unknown as EncryptedVaultSummary
}

function head(index: number, revision = String(index + 1)): MemberSyncItem {
  const entryId = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
  return {
    kind: 'head', entryId, state: 'active', currentRevision: revision,
    memberIndexRevision: revision, currentKeyVersion: 5,
    memberIndex: { testLabel: `Entry ${index}` }, entryKey: {},
  } as unknown as MemberSyncItem
}

function tombstone(item: MemberSyncItem): MemberSyncItem {
  return {
    kind: 'tombstone', entryId: item.entryId, state: null, currentRevision: null,
    memberIndexRevision: null, currentKeyVersion: null, memberIndex: null, entryKey: null,
  }
}

class RecordingCache implements MemberSyncCache {
  readonly events: string[] = []
  active: ActiveCacheState | null = null
  partialProjectionWasVisible = false

  async getActiveState(): Promise<ActiveCacheState | null> { return this.active }
  async readActiveItemPage(): Promise<CachedItemPage> { return { items: [], nextEntryId: null } }
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
  async applyActiveDeltaPage(): Promise<void> { throw new Error('unexpected active delta') }
  async removeMissingVaults(): Promise<void> { this.events.push('retain') }
}

describe('Member sync engine', () => {
  beforeEach(() => {
    cryptoProbe.active = 0
    cryptoProbe.maximum = 0
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
})
