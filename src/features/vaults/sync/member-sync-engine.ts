import { decryptMemberIndex, decryptMemberVaultMetadata, openMemberVaultKey } from '../../../shared/crypto/vault-v2-member-sync'
import { wipe } from '../../../shared/crypto/sodium'
import {
  getMemberDeltaPage,
  getMemberSnapshotPage,
  listEncryptedVaults,
  MemberSyncResetRequiredError,
  type EncryptedVaultSummary,
  type MemberDeltaPage,
  type MemberSyncItem,
} from './member-sync-api'
import type { MemberSyncCache } from './member-sync-cache'
import { useMemberSyncStore, type MemberIndexRecord } from './member-sync-store'

const CACHE_PAGE_ITEMS = 100
const PROJECTION_CHUNK_ITEMS = 25
const MAXIMUM_AEAD_CONCURRENCY = 4
const MAXIMUM_UNLOCKED_MEMBER_ENTRIES = 10_000

interface ProjectionBudget {
  count: number
}

export interface MemberSyncTransport {
  listVaults(signal?: AbortSignal): Promise<EncryptedVaultSummary[]>
  snapshot(vaultId: string, cursor: string | null, signal?: AbortSignal): ReturnType<typeof getMemberSnapshotPage>
  delta(vaultId: string, afterSequence: string | null, continuationCursor: string | null, signal?: AbortSignal): ReturnType<typeof getMemberDeltaPage>
}

const defaultTransport: MemberSyncTransport = {
  listVaults: listEncryptedVaults,
  snapshot: getMemberSnapshotPage,
  delta: getMemberDeltaPage,
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Vault sync aborted', 'AbortError')
}

function compareSequence(left: string, right: string): number {
  const leftValue = BigInt(left)
  const rightValue = BigInt(right)
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}

function isCacheCompatible(cached: EncryptedVaultSummary, current: EncryptedVaultSummary): boolean {
  return cached.memberVaultKey.organizationId === current.memberVaultKey.organizationId
    && cached.memberKeyGeneration === current.memberKeyGeneration
    && cached.currentKeyEpoch.vaultKeyVersion === current.currentKeyEpoch.vaultKeyVersion
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function publishedEntryCount(): number {
  let count = 0
  for (const vault of useMemberSyncStore.getState().vaults.values()) count += vault.entries.size
  return count
}

export class MemberSyncEngine {
  private readonly cache: MemberSyncCache
  private readonly transport: MemberSyncTransport
  private readonly yieldControl: () => Promise<void>

  constructor(
    cache: MemberSyncCache,
    transport: MemberSyncTransport = defaultTransport,
    yieldControl: () => Promise<void> = defaultYield,
  ) {
    this.cache = cache
    this.transport = transport
    this.yieldControl = yieldControl
  }

  async synchronize(userId: string, memberPrivateKey: Uint8Array, signal: AbortSignal): Promise<void> {
    const store = useMemberSyncStore.getState()
    store.begin()
    try {
      const vaults = await this.transport.listVaults(signal)
      assertNotAborted(signal)
      const declaredEntries = vaults.reduce((total, vault) => total + vault.entryCount, 0)
      if (!Number.isSafeInteger(declaredEntries) || declaredEntries > MAXIMUM_UNLOCKED_MEMBER_ENTRIES) {
        throw new Error('Vault Member index exceeds the supported unlocked entry budget')
      }
      const retainedVaultIds = new Set(vaults.map((vault) => vault.id))
      await this.cache.removeMissingVaults(userId, retainedVaultIds)
      useMemberSyncStore.getState().retainVaults(retainedVaultIds)
      let failures = 0
      const projectionBudget: ProjectionBudget = { count: publishedEntryCount() }
      for (const vault of vaults) {
        assertNotAborted(signal)
        projectionBudget.count -= useMemberSyncStore.getState().vaults.get(vault.id)?.entries.size ?? 0
        try {
          await this.synchronizeVault(userId, memberPrivateKey, vault, projectionBudget, signal)
        } catch (error) {
          if (signal.aborted) throw error
          failures += 1
          useMemberSyncStore.getState().failVault(vault.id)
          projectionBudget.count = publishedEntryCount()
        }
      }
      if (failures > 0) useMemberSyncStore.getState().fail()
      else useMemberSyncStore.getState().complete()
    } catch (error) {
      if (!signal.aborted) useMemberSyncStore.getState().fail()
      throw error
    }
  }

  private async synchronizeVault(
    userId: string,
    memberPrivateKey: Uint8Array,
    vault: EncryptedVaultSummary,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<void> {
    const budgetBeforeVault = projectionBudget.count
    const organizationId = vault.memberVaultKey.organizationId
    const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
      organizationId,
      vaultId: vault.id,
      memberId: userId,
      vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
      memberKeyGeneration: vault.memberKeyGeneration,
    }, memberPrivateKey)
    try {
      assertNotAborted(signal)
      const metadata = await decryptMemberVaultMetadata(vault.memberVaultMetadata, {
        organizationId,
        vaultId: vault.id,
        keyVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, vaultKey)
      const cached = await this.cache.getActiveState(userId, vault.id)
      if (!cached || !isCacheCompatible(cached.vault, vault) || compareSequence(cached.appliedThroughSequence, vault.memberSequence) > 0) {
        await this.rebuildSnapshot(userId, vault, vaultKey, metadata, projectionBudget, signal)
        return
      }
      const published = useMemberSyncStore.getState().vaults.get(vault.id)
      let entries: Map<string, MemberIndexRecord>
      if (published?.appliedThroughSequence === cached.appliedThroughSequence) {
        entries = new Map(published.entries)
        projectionBudget.count += entries.size
        if (projectionBudget.count > MAXIMUM_UNLOCKED_MEMBER_ENTRIES) {
          throw new Error('Vault Member index exceeds the supported unlocked entry budget')
        }
      } else {
        entries = await this.decryptCachedIndex(userId, vault, vaultKey, projectionBudget, signal)
      }
      try {
        await this.applyActiveDelta(userId, vault, vaultKey, metadata, entries, cached.appliedThroughSequence, projectionBudget, signal)
      } catch (error) {
        if (!(error instanceof MemberSyncResetRequiredError)) throw error
        projectionBudget.count = budgetBeforeVault
        await this.rebuildSnapshot(userId, vault, vaultKey, metadata, projectionBudget, signal)
      }
    } catch (error) {
      projectionBudget.count = budgetBeforeVault
      throw error
    } finally {
      wipe(vaultKey)
    }
  }

  private async decryptCachedIndex(
    userId: string,
    vault: EncryptedVaultSummary,
    vaultKey: Uint8Array,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<Map<string, MemberIndexRecord>> {
    const entries = new Map<string, MemberIndexRecord>()
    let afterEntryId: string | null = null
    do {
      assertNotAborted(signal)
      const page = await this.cache.readActiveItemPage(userId, vault.id, afterEntryId, CACHE_PAGE_ITEMS)
      await this.decryptAndApply(page.items, entries, vault, vaultKey, projectionBudget, signal)
      afterEntryId = page.nextEntryId
    } while (afterEntryId)
    return entries
  }

  private async rebuildSnapshot(
    userId: string,
    vault: EncryptedVaultSummary,
    vaultKey: Uint8Array,
    metadata: Awaited<ReturnType<typeof decryptMemberVaultMetadata>>,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const budgetBeforeAttempt = projectionBudget.count
      try {
        await this.rebuildSnapshotAttempt(userId, vault, vaultKey, metadata, projectionBudget, signal)
        return
      } catch (error) {
        projectionBudget.count = budgetBeforeAttempt
        if (!(error instanceof MemberSyncResetRequiredError) || attempt === 1) throw error
      }
    }
  }

  private async rebuildSnapshotAttempt(
    userId: string,
    vault: EncryptedVaultSummary,
    vaultKey: Uint8Array,
    metadata: Awaited<ReturnType<typeof decryptMemberVaultMetadata>>,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<void> {
    const entries = new Map<string, MemberIndexRecord>()
    const namespace = crypto.randomUUID()
    let cursor: string | null = null
    let baseSequence: string | null = null
    const seenCursors = new Set<string>()
    do {
      assertNotAborted(signal)
      const page = await this.transport.snapshot(vault.id, cursor, signal)
      if (baseSequence === null) {
        baseSequence = page.snapshotBaseSequence
        await this.cache.beginSnapshot(userId, vault, namespace, baseSequence)
      } else if (page.snapshotBaseSequence !== baseSequence) {
        throw new Error('Vault snapshot boundary changed between pages')
      }
      await this.cache.applySnapshotPage(userId, vault.id, namespace, page.items, page.nextCursor)
      await this.decryptAndApply(page.items, entries, vault, vaultKey, projectionBudget, signal)
      if (page.nextCursor) {
        if (seenCursors.has(page.nextCursor)) throw new Error('Vault snapshot cursor did not make progress')
        seenCursors.add(page.nextCursor)
      }
      cursor = page.nextCursor
    } while (cursor)
    if (baseSequence === null) throw new Error('Vault snapshot returned no boundary')
    const appliedThrough = await this.applyPendingDelta(userId, vault, namespace, vaultKey, entries, baseSequence, projectionBudget, signal)
    await this.cache.completeSnapshot(userId, vault, namespace, appliedThrough)
    assertNotAborted(signal)
    this.publish(vault.id, metadata, entries, appliedThrough, 'ready')
  }

  private async applyPendingDelta(
    userId: string,
    vault: EncryptedVaultSummary,
    namespace: string,
    vaultKey: Uint8Array,
    entries: Map<string, MemberIndexRecord>,
    afterSequence: string,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<string> {
    let appliedThrough = afterSequence
    let continuation: string | null = null
    let deltaUpperBound: string | null = null
    do {
      assertNotAborted(signal)
      const page = await this.transport.delta(vault.id, continuation ? null : afterSequence, continuation, signal)
      deltaUpperBound = this.assertDeltaProgress(appliedThrough, deltaUpperBound, page)
      await this.cache.applyPendingDeltaPage(userId, vault.id, namespace, appliedThrough, page)
      await this.decryptAndApply(page.items, entries, vault, vaultKey, projectionBudget, signal)
      appliedThrough = page.appliedThroughSequence
      continuation = page.continuationCursor
    } while (continuation)
    return appliedThrough
  }

  private async applyActiveDelta(
    userId: string,
    vault: EncryptedVaultSummary,
    vaultKey: Uint8Array,
    metadata: Awaited<ReturnType<typeof decryptMemberVaultMetadata>>,
    entries: Map<string, MemberIndexRecord>,
    afterSequence: string,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<void> {
    let appliedThrough = afterSequence
    let continuation: string | null = null
    let deltaUpperBound: string | null = null
    do {
      assertNotAborted(signal)
      const page = await this.transport.delta(vault.id, continuation ? null : afterSequence, continuation, signal)
      deltaUpperBound = this.assertDeltaProgress(appliedThrough, deltaUpperBound, page)
      await this.cache.applyActiveDeltaPage(userId, vault, appliedThrough, page)
      await this.decryptAndApply(page.items, entries, vault, vaultKey, projectionBudget, signal)
      appliedThrough = page.appliedThroughSequence
      continuation = page.continuationCursor
      assertNotAborted(signal)
      this.publish(vault.id, metadata, entries, appliedThrough, continuation ? 'syncing' : 'ready')
    } while (continuation)
  }

  private assertDeltaProgress(previousSequence: string, expectedUpperBound: string | null, page: MemberDeltaPage): string {
    if (expectedUpperBound !== null && page.deltaUpperBound !== expectedUpperBound) {
      throw new Error('Vault delta boundary changed between pages')
    }
    if (compareSequence(page.appliedThroughSequence, previousSequence) < 0
      || compareSequence(page.appliedThroughSequence, page.deltaUpperBound) > 0) {
      throw new Error('Vault delta sequence moved outside its stable boundary')
    }
    if (page.continuationCursor && page.appliedThroughSequence === previousSequence) {
      throw new Error('Vault delta continuation made no progress')
    }
    if (!page.continuationCursor && page.appliedThroughSequence !== page.deltaUpperBound) {
      throw new Error('Vault delta ended before its stable boundary')
    }
    return page.deltaUpperBound
  }

  private async decryptAndApply(
    items: MemberSyncItem[],
    entries: Map<string, MemberIndexRecord>,
    vault: EncryptedVaultSummary,
    vaultKey: Uint8Array,
    projectionBudget: ProjectionBudget,
    signal: AbortSignal,
  ): Promise<void> {
    for (let offset = 0; offset < items.length; offset += PROJECTION_CHUNK_ITEMS) {
      const chunk = items.slice(offset, offset + PROJECTION_CHUNK_ITEMS)
      const results = new Array<MemberIndexRecord | null>(chunk.length)
      let next = 0
      const workers = Array.from({ length: Math.min(MAXIMUM_AEAD_CONCURRENCY, chunk.length) }, async () => {
        while (next < chunk.length) {
          const index = next
          next += 1
          const item = chunk[index]
          if (item.kind === 'tombstone') {
            results[index] = null
            continue
          }
          try {
            const payload = await decryptMemberIndex(item.memberIndex, item.entryKey, {
              organizationId: vault.memberVaultKey.organizationId,
              vaultId: vault.id,
              entryId: item.entryId,
              memberIndexRevision: item.memberIndexRevision,
              keyVersion: item.currentKeyVersion,
              memberKeyGeneration: vault.memberKeyGeneration,
              wrappingKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
            }, vaultKey)
            results[index] = {
              entryId: item.entryId,
              state: item.state,
              currentRevision: item.currentRevision,
              memberIndexRevision: item.memberIndexRevision,
              currentKeyVersion: item.currentKeyVersion,
              payload,
              corrupt: false,
            }
          } catch (error) {
            if (signal.aborted) throw error
            results[index] = {
              entryId: item.entryId,
              state: item.state,
              currentRevision: item.currentRevision,
              memberIndexRevision: item.memberIndexRevision,
              currentKeyVersion: item.currentKeyVersion,
              payload: null,
              corrupt: true,
            }
          }
        }
      })
      await Promise.all(workers)
      assertNotAborted(signal)
      const sizeBeforeChunk = entries.size
      for (let index = 0; index < chunk.length; index += 1) {
        const item = chunk[index]
        const result = results[index]
        if (item.kind === 'tombstone') {
          entries.delete(item.entryId)
          continue
        }
        const current = entries.get(item.entryId)
        if (!current || compareSequence(current.memberIndexRevision, item.memberIndexRevision) <= 0) entries.set(item.entryId, result!)
      }
      const nextCount = projectionBudget.count + entries.size - sizeBeforeChunk
      if (nextCount > MAXIMUM_UNLOCKED_MEMBER_ENTRIES) {
        throw new Error('Vault Member index exceeds the supported unlocked entry budget')
      }
      projectionBudget.count = nextCount
      await this.yieldControl()
    }
  }

  private publish(
    vaultId: string,
    metadata: Awaited<ReturnType<typeof decryptMemberVaultMetadata>>,
    entries: Map<string, MemberIndexRecord>,
    appliedThroughSequence: string,
    status: 'syncing' | 'ready',
  ): void {
    useMemberSyncStore.getState().publishVault({
      vaultId,
      metadata,
      entries: new Map(entries),
      appliedThroughSequence,
      status,
    })
  }
}
