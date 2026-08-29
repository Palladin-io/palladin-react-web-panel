import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type {
  EncryptedVaultSummary,
  MemberDeltaPage,
  MemberSnapshotPage,
  MemberSyncItem,
} from './member-sync-api'
import { IndexedDbMemberSyncCache } from './member-sync-cache'
import validSnapshotFixture from './__fixtures__/cvt-557-valid-snapshot.json'

const userId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'

function vault(sequence: string): EncryptedVaultSummary {
  return {
    id: vaultId,
    memberSequence: sequence,
  } as unknown as EncryptedVaultSummary
}

function head(entryId: string, revision: string): MemberSyncItem {
  return {
    kind: 'head',
    entryId,
    state: 'active',
    updatedAt: '2026-07-26T12:00:00Z',
    currentRevision: revision,
    memberIndexRevision: revision,
    currentKeyVersion: 1,
    memberIndex: {},
    memberSecret: {},
    entryKey: {},
  } as unknown as MemberSyncItem
}

function delta(sequence: string, items: MemberSyncItem[]): MemberDeltaPage {
  return {
    accessContext: validSnapshotFixture.response.accessContext,
    memberVaultKey: validSnapshotFixture.response.memberVaultKey,
    deltaUpperBound: sequence,
    appliedThroughSequence: sequence,
    continuationCursor: null,
    items,
  } as MemberDeltaPage
}

function snapshot(sequence: string, items: MemberSyncItem[]): MemberSnapshotPage {
  return {
    accessContext: validSnapshotFixture.response.accessContext,
    memberVaultKey: validSnapshotFixture.response.memberVaultKey,
    snapshotBaseSequence: sequence,
    items,
    nextCursor: null,
  } as MemberSnapshotPage
}

let databaseSequence = 0

function cache(): IndexedDbMemberSyncCache {
  databaseSequence += 1
  return new IndexedDbMemberSyncCache(`palladin-vault-ciphertext-cache-test-${databaseSequence}`)
}

describe('encrypted Member sync cache', () => {
  it('keeps the prior namespace visible until the replacement snapshot and closing delta commit', async () => {
    const subject = cache()
    const oldEntry = '33333333-3333-4333-8333-333333333333'
    const newEntry = '44444444-4444-4444-8444-444444444444'

    await subject.beginSnapshot(userId, vault('1'), 'old', '1')
    await subject.applySnapshotPage(userId, vaultId, 'old', snapshot('1', [head(oldEntry, '1')]))
    await subject.completeSnapshot(userId, vault('1'), 'old', '1')

    await subject.beginSnapshot(userId, vault('2'), 'new', '2')
    await subject.applySnapshotPage(userId, vaultId, 'new', snapshot('2', [head(newEntry, '2')]))
    await subject.applyPendingDeltaPage(userId, vaultId, 'new', '2', delta('3', []))

    expect((await subject.getActiveState(userId, vaultId))?.namespace).toBe('old')
    expect((await subject.readActiveItemPage(userId, vaultId, null, 100)).items.map((item) => item.entryId)).toEqual([oldEntry])

    await subject.completeSnapshot(userId, vault('3'), 'new', '3')
    expect((await subject.getActiveState(userId, vaultId))?.namespace).toBe('new')
    expect((await subject.readActiveItemPage(userId, vaultId, null, 100)).items.map((item) => item.entryId)).toEqual([newEntry])
  })

  it('keeps the active summary paired with its old namespace when a rekey snapshot is interrupted', async () => {
    const subject = cache()
    await subject.beginSnapshot(userId, vault('1'), 'old', '1')
    await subject.applySnapshotPage(userId, vaultId, 'old', snapshot('1', [head('33333333-3333-4333-8333-333333333333', '1')]))
    await subject.completeSnapshot(userId, vault('1'), 'old', '1')

    await subject.beginSnapshot(userId, vault('9'), 'replacement', '9')

    const active = await subject.getActiveState(userId, vaultId)
    expect(active?.namespace).toBe('old')
    expect(active?.vault.memberSequence).toBe('1')
  })

  it('rolls back item writes when the active delta cursor compare-and-swap fails', async () => {
    const subject = cache()
    const entryId = '33333333-3333-4333-8333-333333333333'
    await subject.beginSnapshot(userId, vault('5'), 'active', '5')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('5', [head(entryId, '5')]))
    await subject.completeSnapshot(userId, vault('5'), 'active', '5')

    await expect(subject.applyActiveDeltaPage(userId, vault('6'), '4', delta('6', [head(entryId, '6')]))).rejects.toThrow('cursor changed')

    expect((await subject.getActiveState(userId, vaultId))?.appliedThroughSequence).toBe('5')
    const [persisted] = (await subject.readActiveItemPage(userId, vaultId, null, 100)).items
    expect(persisted.memberIndexRevision).toBe('5')
  })

  it('applies the page and its cursor atomically and ignores an older retried revision', async () => {
    const subject = cache()
    const entryId = '33333333-3333-4333-8333-333333333333'
    await subject.beginSnapshot(userId, vault('1'), 'active', '1')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('1', [head(entryId, '4')]))
    await subject.completeSnapshot(userId, vault('1'), 'active', '1')

    await subject.applyActiveDeltaPage(userId, vault('2'), '1', delta('2', [head(entryId, '3')]))

    expect((await subject.getActiveState(userId, vaultId))?.appliedThroughSequence).toBe('2')
    const [persisted] = (await subject.readActiveItemPage(userId, vaultId, null, 100)).items
    expect(persisted.memberIndexRevision).toBe('4')
  })

  it('fences a local item read against a newer active sequence or authority', async () => {
    const subject = cache()
    const entryId = '33333333-3333-4333-8333-333333333333'
    await subject.beginSnapshot(userId, vault('1'), 'active', '1')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('1', [head(entryId, '1')]))
    await subject.completeSnapshot(userId, vault('1'), 'active', '1')
    const beforeDelta = await subject.readActiveItem(userId, vaultId, entryId)
    expect(beforeDelta).not.toBeNull()

    await subject.applyActiveDeltaPage(userId, vault('2'), '1', delta('2', [head(entryId, '2')]))

    await expect(subject.validateAndObserveActiveClock(
      userId,
      vaultId,
      beforeDelta!.namespace,
      beforeDelta!.appliedThroughSequence,
      beforeDelta!.authority,
      Date.parse(validSnapshotFixture.response.accessContext.issuedAt),
      Date.parse(validSnapshotFixture.response.accessContext.issuedAt),
      5 * 60 * 1_000,
    )).rejects.toThrow('active generation changed')

    const beforeRenewal = await subject.readActiveItem(userId, vaultId, entryId)
    const renewedPage = structuredClone(delta('2', []))
    renewedPage.accessContext.notAfter = '2026-08-31T08:00:00Z'
    await subject.applyActiveDeltaPage(userId, vault('2'), '2', renewedPage)

    await expect(subject.validateAndObserveActiveClock(
      userId,
      vaultId,
      beforeRenewal!.namespace,
      beforeRenewal!.appliedThroughSequence,
      beforeRenewal!.authority,
      Date.parse(validSnapshotFixture.response.accessContext.issuedAt),
      Date.parse(validSnapshotFixture.response.accessContext.issuedAt),
      5 * 60 * 1_000,
    )).rejects.toThrow('active generation changed')
  })

  it('persists ciphertext and structural metadata only', async () => {
    const databaseName = `palladin-vault-ciphertext-cache-test-${++databaseSequence}`
    const subject = new IndexedDbMemberSyncCache(databaseName)
    const item = head('33333333-3333-4333-8333-333333333333', '1')
    await subject.beginSnapshot(userId, vault('1'), 'active', '1')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('1', [item]))
    await subject.completeSnapshot(userId, vault('1'), 'active', '1')

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const operation = indexedDB.open(databaseName)
      operation.onsuccess = () => resolve(operation.result)
      operation.onerror = () => reject(operation.error)
    })
    const transaction = database.transaction(['member-vaults', 'member-items'], 'readonly')
    const persisted = await Promise.all([
      new Promise<unknown[]>((resolve, reject) => {
        const operation = transaction.objectStore('member-vaults').getAll()
        operation.onsuccess = () => resolve(operation.result)
        operation.onerror = () => reject(operation.error)
      }),
      new Promise<unknown[]>((resolve, reject) => {
        const operation = transaction.objectStore('member-items').getAll()
        operation.onsuccess = () => resolve(operation.result)
        operation.onerror = () => reject(operation.error)
      }),
    ])
    const serialized = JSON.stringify(persisted)
    expect(serialized).not.toContain('memberLabel')
    expect(serialized).not.toContain('searchFields')
    expect(serialized).toContain('memberVaultKey')
    expect(serialized).toContain('memberSecret')
    expect(serialized).not.toContain('rawVaultKey')
    expect(serialized).not.toContain('expectedCurrentVaultKeyHex')
    expect(serialized).not.toContain('privateKey')
  })

  it('keeps a tombstone terminal inside a generation when a delayed head arrives', async () => {
    const subject = cache()
    const entryId = '33333333-3333-4333-8333-333333333333'
    await subject.beginSnapshot(userId, vault('1'), 'active', '1')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('1', [head(entryId, '1')]))
    await subject.completeSnapshot(userId, vault('1'), 'active', '1')
    await subject.applyActiveDeltaPage(userId, vault('2'), '1', delta('2', [{
      entryId, kind: 'tombstone', state: null, updatedAt: null, currentRevision: null,
      memberIndexRevision: null, currentKeyVersion: null, entryKey: null,
      memberIndex: null, memberSecret: null,
    }]))
    await subject.applyActiveDeltaPage(userId, vault('3'), '2', delta('3', [head(entryId, '99')]))

    const active = await subject.readActiveItem(userId, vaultId, entryId)
    expect(active?.item?.kind).toBe('tombstone')
  })

  it('deletes every active and staging namespace for a logged-out profile', async () => {
    const subject = cache()
    await subject.beginSnapshot(userId, vault('1'), 'active', '1')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('1', [
      head('33333333-3333-4333-8333-333333333333', '1'),
    ]))
    await subject.completeSnapshot(userId, vault('1'), 'active', '1')
    await subject.beginSnapshot(userId, vault('2'), 'pending', '2')
    await subject.applySnapshotPage(userId, vaultId, 'pending', snapshot('2', [
      head('44444444-4444-4444-8444-444444444444', '2'),
    ]))

    await subject.removeUser(userId)

    expect(await subject.listActiveStates(userId)).toEqual([])
    expect(await subject.readActiveItemPage(userId, vaultId, null, 100)).toEqual({
      items: [], nextEntryId: null,
    })
  })

  it('rejects an oversized staging page atomically without replacing the active generation', async () => {
    const subject = new IndexedDbMemberSyncCache(
      `palladin-vault-ciphertext-cache-test-${++databaseSequence}`,
      64 * 1024,
    )
    const activeEntry = head('33333333-3333-4333-8333-333333333333', '1')
    await subject.beginSnapshot(userId, vault('1'), 'active', '1')
    await subject.applySnapshotPage(userId, vaultId, 'active', snapshot('1', [activeEntry]))
    await subject.completeSnapshot(userId, vault('1'), 'active', '1')
    await subject.beginSnapshot(userId, vault('2'), 'oversized', '2')
    const oversized = {
      ...head('44444444-4444-4444-8444-444444444444', '2'),
      memberSecret: { encodedSuitePayload: 'x'.repeat(128 * 1024) },
    } as MemberSyncItem

    await expect(subject.applySnapshotPage(
      userId,
      vaultId,
      'oversized',
      snapshot('2', [oversized]),
    )).rejects.toThrow('profile byte limit')

    expect((await subject.getActiveState(userId, vaultId))?.namespace).toBe('active')
    expect((await subject.readActiveItem(userId, vaultId, activeEntry.entryId))?.item).toEqual(activeEntry)
  })
})
