import type {
  CurrentMemberPageAuthority,
  EncryptedVaultSummary,
  MemberDeltaPage,
  MemberSnapshotPage,
  MemberSyncItem,
} from './member-sync-api'
import { registerClientProfileCleanup } from '../../../shared/lib/client-profile-cleanup'

export type CachedMemberSyncAuthority = CurrentMemberPageAuthority

interface CachedVaultState {
  scopeId: string
  userId: string
  vaultId: string
  activeNamespace: string | null
  activeAppliedThroughSequence: string | null
  activeVault: EncryptedVaultSummary | null
  activeAuthority: CachedMemberSyncAuthority | null
  activeStoredBytes: number
  activeMaximumObservedWallTime: number | null
  pendingNamespace: string | null
  pendingSnapshotBaseSequence: string | null
  pendingAppliedThroughSequence: string | null
  pendingCursor: string | null
  pendingVault: EncryptedVaultSummary | null
  pendingAuthority: CachedMemberSyncAuthority | null
  pendingStoredBytes: number
}

interface CachedMemberItem {
  scopeNamespace: string
  entryId: string
  item: MemberSyncItem
  storedBytes: number
}

export interface ActiveCacheState {
  namespace: string
  appliedThroughSequence: string
  vault: EncryptedVaultSummary
  authority: CachedMemberSyncAuthority
}

export interface CachedCurrentMemberEntry extends ActiveCacheState {
  item: MemberSyncItem | null
}

export interface CachedItemPage {
  items: MemberSyncItem[]
  nextEntryId: string | null
}

export interface MemberSyncCache {
  getActiveState(userId: string, vaultId: string): Promise<ActiveCacheState | null>
  listActiveStates(userId: string): Promise<ActiveCacheState[]>
  readActiveItem(userId: string, vaultId: string, entryId: string): Promise<CachedCurrentMemberEntry | null>
  readActiveItemPage(userId: string, vaultId: string, afterEntryId: string | null, limit: number): Promise<CachedItemPage>
  beginSnapshot(userId: string, vault: EncryptedVaultSummary, namespace: string, baseSequence: string): Promise<void>
  applySnapshotPage(userId: string, vaultId: string, namespace: string, page: MemberSnapshotPage): Promise<void>
  applyPendingDeltaPage(userId: string, vaultId: string, namespace: string, expectedSequence: string, page: MemberDeltaPage): Promise<void>
  completeSnapshot(userId: string, vault: EncryptedVaultSummary, namespace: string, appliedThroughSequence: string): Promise<void>
  applyActiveDeltaPage(userId: string, vault: EncryptedVaultSummary, expectedSequence: string, page: MemberDeltaPage): Promise<void>
  validateAndObserveActiveClock(
    userId: string,
    vaultId: string,
    namespace: string,
    expectedAppliedThroughSequence: string,
    expectedAuthority: CachedMemberSyncAuthority,
    currentWallTime: number,
    candidateMaximumWallTime: number,
    maximumRollbackMs: number,
  ): Promise<number>
  removeActiveGeneration(userId: string, vaultId: string, expected: ActiveCacheState): Promise<boolean>
  removeVault(userId: string, vaultId: string): Promise<void>
  removeUser(userId: string): Promise<void>
  removeMissingVaults(userId: string, retainedVaultIds: ReadonlySet<string>): Promise<void>
}

export class MemberSyncCacheQuotaError extends Error {
  constructor() {
    super('Vault ciphertext cache exceeds the profile byte limit')
    this.name = 'MemberSyncCacheQuotaError'
  }
}

const DATABASE_NAME = 'palladin-vault-ciphertext-cache'
const DATABASE_VERSION = 4
const VAULT_STORE = 'member-vaults'
const ITEM_STORE = 'member-items'
const USER_INDEX = 'userId'
const SCOPE_NAMESPACE_INDEX = 'scopeNamespace'
const MAXIMUM_PROFILE_CACHE_BYTES = 512 * 1024 * 1024
const textEncoder = new TextEncoder()

function scopeId(userId: string, vaultId: string): string {
  return `${userId}:${vaultId}`
}

function scopeNamespace(userId: string, vaultId: string, namespace: string): string {
  return `${scopeId(userId, vaultId)}:${namespace}`
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  const completion = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
  })
  // A request can fail before its caller reaches `await completion`. Attach an
  // observer immediately so the browser never reports a second, unhandled
  // rejection; awaiting the original promise still preserves the failure.
  void completion.catch(() => undefined)
  return completion
}

async function abortTransaction(transaction: IDBTransaction, done: Promise<void>, error: Error): Promise<never> {
  try {
    transaction.abort()
  } catch {
    // The browser may already have aborted the transaction. Its completion
    // promise below remains the authoritative settlement signal.
  }
  await done.catch(() => undefined)
  throw error
}

function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const operation = indexedDB.open(databaseName, DATABASE_VERSION)
    operation.onupgradeneeded = (event) => {
      const database = operation.result
      if (event.oldVersion === 0) {
        const vaults = database.createObjectStore(VAULT_STORE, { keyPath: 'scopeId' })
        vaults.createIndex(USER_INDEX, 'userId')
        const items = database.createObjectStore(ITEM_STORE, { keyPath: ['scopeNamespace', 'entryId'] })
        items.createIndex(SCOPE_NAMESPACE_INDEX, 'scopeNamespace')
      } else if (event.oldVersion < DATABASE_VERSION) {
        // Older caches either conflate active/pending state or omit the
        // structural UpdatedAt required for deterministic local recents. The
        // cache is disposable ciphertext, so rebuild rather than guessing.
        operation.transaction!.objectStore(VAULT_STORE).clear()
        operation.transaction!.objectStore(ITEM_STORE).clear()
      }
    }
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('Unable to open Vault ciphertext cache'))
    operation.onblocked = () => reject(new Error('Vault ciphertext cache upgrade is blocked'))
  })
}

function compareRevision(left: MemberSyncItem, right: MemberSyncItem): number {
  if (left.kind === 'tombstone') return 1
  if (right.kind === 'tombstone') return -1
  const leftRevision = BigInt(left.memberIndexRevision)
  const rightRevision = BigInt(right.memberIndexRevision)
  return leftRevision < rightRevision ? -1 : leftRevision > rightRevision ? 1 : 0
}

function encodedBytes(value: unknown): number {
  return textEncoder.encode(JSON.stringify(value)).byteLength
}

function cachedItem(namespace: string, item: MemberSyncItem): CachedMemberItem {
  const base = { scopeNamespace: namespace, entryId: item.entryId, item }
  let storedBytes = encodedBytes({ ...base, storedBytes: 0 })
  storedBytes = encodedBytes({ ...base, storedBytes })
  return { ...base, storedBytes }
}

function storedStateBytes(state: CachedVaultState): number {
  return encodedBytes(state) + (state.activeStoredBytes ?? 0) + (state.pendingStoredBytes ?? 0)
}

function matchesActiveGeneration(
  state: CachedVaultState | undefined,
  namespace: string,
  appliedThroughSequence: string,
  authority: CachedMemberSyncAuthority,
): state is CachedVaultState & { activeNamespace: string, activeAuthority: CachedMemberSyncAuthority } {
  return state?.activeNamespace === namespace
    && state.activeAppliedThroughSequence === appliedThroughSequence
    && state.activeAuthority !== null
    && JSON.stringify(state.activeAuthority) === JSON.stringify(authority)
}

async function applyItems(store: IDBObjectStore, namespace: string, items: MemberSyncItem[]): Promise<number> {
  let byteDelta = 0
  for (const item of items) {
    const key: IDBValidKey = [namespace, item.entryId]
    const existing = await request(store.get(key)) as CachedMemberItem | undefined
    if (!existing || compareRevision(existing.item, item) <= 0) {
      const next = cachedItem(namespace, item)
      byteDelta += next.storedBytes - (existing?.storedBytes ?? 0)
      await request(store.put(next))
    }
  }
  return byteDelta
}

async function deleteNamespaceFromStore(store: IDBObjectStore, namespace: string): Promise<void> {
  const index = store.index(SCOPE_NAMESPACE_INDEX)
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(namespace))
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Unable to clean old Vault cache namespace'))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
}

async function deleteNamespacePrefixFromStore(store: IDBObjectStore, prefix: string): Promise<void> {
  const index = store.index(SCOPE_NAMESPACE_INDEX)
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`)
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openKeyCursor(range)
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Unable to clean Vault cache scope'))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) {
        resolve()
        return
      }
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
}

export class IndexedDbMemberSyncCache implements MemberSyncCache {
  private database: Promise<IDBDatabase> | null = null
  private readonly databaseName: string
  private readonly maximumProfileCacheBytes: number

  constructor(databaseName = DATABASE_NAME, maximumProfileCacheBytes = MAXIMUM_PROFILE_CACHE_BYTES) {
    this.databaseName = databaseName
    this.maximumProfileCacheBytes = maximumProfileCacheBytes
  }

  private getDatabase(): Promise<IDBDatabase> {
    this.database ??= openDatabase(this.databaseName)
    return this.database
  }

  private async profileBytesWithReplacement(
    store: IDBObjectStore,
    userId: string,
    replacement: CachedVaultState,
  ): Promise<number> {
    const states = await request(store.index(USER_INDEX).getAll(userId)) as CachedVaultState[]
    return states.reduce(
      (total, state) => total + storedStateBytes(state.scopeId === replacement.scopeId ? replacement : state),
      states.some((state) => state.scopeId === replacement.scopeId) ? 0 : storedStateBytes(replacement),
    )
  }

  private async putWithinProfileQuota(
    transaction: IDBTransaction,
    done: Promise<void>,
    store: IDBObjectStore,
    state: CachedVaultState,
  ): Promise<void> {
    if (await this.profileBytesWithReplacement(store, state.userId, state) > this.maximumProfileCacheBytes) {
      return abortTransaction(transaction, done, new MemberSyncCacheQuotaError())
    }
    await request(store.put(state))
  }

  async getActiveState(userId: string, vaultId: string): Promise<ActiveCacheState | null> {
    const database = await this.getDatabase()
    const transaction = database.transaction(VAULT_STORE, 'readonly')
    const done = transactionDone(transaction)
    const state = await request(transaction.objectStore(VAULT_STORE).get(scopeId(userId, vaultId))) as CachedVaultState | undefined
    await done
    if (!state?.activeNamespace || state.activeAppliedThroughSequence === null
      || !state.activeVault || !state.activeAuthority) return null
    return {
      namespace: state.activeNamespace,
      appliedThroughSequence: state.activeAppliedThroughSequence,
      vault: state.activeVault,
      authority: state.activeAuthority,
    }
  }

  async listActiveStates(userId: string): Promise<ActiveCacheState[]> {
    const database = await this.getDatabase()
    const transaction = database.transaction(VAULT_STORE, 'readonly')
    const done = transactionDone(transaction)
    const states = await request(
      transaction.objectStore(VAULT_STORE).index(USER_INDEX).getAll(userId),
    ) as CachedVaultState[]
    await done
    return states.flatMap((state): ActiveCacheState[] => state.activeNamespace
      && state.activeAppliedThroughSequence !== null && state.activeVault && state.activeAuthority
      ? [{
          namespace: state.activeNamespace,
          appliedThroughSequence: state.activeAppliedThroughSequence,
          vault: state.activeVault,
          authority: state.activeAuthority,
        }]
      : [])
  }

  async readActiveItem(userId: string, vaultId: string, entryId: string): Promise<CachedCurrentMemberEntry | null> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readonly')
    const done = transactionDone(transaction)
    const state = await request(transaction.objectStore(VAULT_STORE).get(scopeId(userId, vaultId))) as CachedVaultState | undefined
    if (!state?.activeNamespace || state.activeAppliedThroughSequence === null
      || !state.activeVault || !state.activeAuthority) {
      await done
      return null
    }
    const item = await request(transaction.objectStore(ITEM_STORE).get([
      scopeNamespace(userId, vaultId, state.activeNamespace),
      entryId,
    ])) as CachedMemberItem | undefined
    await done
    return {
      namespace: state.activeNamespace,
      appliedThroughSequence: state.activeAppliedThroughSequence,
      vault: state.activeVault,
      authority: state.activeAuthority,
      item: item?.item ?? null,
    }
  }

  async readActiveItemPage(userId: string, vaultId: string, afterEntryId: string | null, limit: number): Promise<CachedItemPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('invalid Vault cache page size')
    const active = await this.getActiveState(userId, vaultId)
    if (!active) return { items: [], nextEntryId: null }
    const namespace = scopeNamespace(userId, vaultId, active.namespace)
    const lower: IDBValidKey = [namespace, afterEntryId ?? '']
    const upper: IDBValidKey = [namespace, '\uffff']
    const range = IDBKeyRange.bound(lower, upper, afterEntryId !== null, false)
    const database = await this.getDatabase()
    const transaction = database.transaction(ITEM_STORE, 'readonly')
    const done = transactionDone(transaction)
    const store = transaction.objectStore(ITEM_STORE)
    const items: MemberSyncItem[] = []
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = store.openCursor(range)
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Unable to read Vault cache page'))
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor || items.length === limit) {
          resolve()
          return
        }
        items.push((cursor.value as CachedMemberItem).item)
        cursor.continue()
      }
    })
    await done
    return { items, nextEntryId: items.length === limit ? items.at(-1)!.entryId : null }
  }

  async beginSnapshot(userId: string, vault: EncryptedVaultSummary, namespace: string, baseSequence: string): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore(VAULT_STORE)
    const id = scopeId(userId, vault.id)
    const previous = await request(store.get(id)) as CachedVaultState | undefined
    if (previous?.activeNamespace === namespace) {
      return abortTransaction(transaction, done, new Error('Vault snapshot namespace collides with the active generation'))
    }
    if (previous?.pendingNamespace && previous.pendingNamespace !== namespace) {
      await deleteNamespaceFromStore(
        transaction.objectStore(ITEM_STORE),
        scopeNamespace(userId, vault.id, previous.pendingNamespace),
      )
    }
    const nextState = {
      scopeId: id,
      userId,
      vaultId: vault.id,
      activeNamespace: previous?.activeNamespace ?? null,
      activeAppliedThroughSequence: previous?.activeAppliedThroughSequence ?? null,
      activeVault: previous?.activeVault ?? null,
      activeAuthority: previous?.activeAuthority ?? null,
      activeStoredBytes: previous?.activeStoredBytes ?? 0,
      activeMaximumObservedWallTime: previous?.activeMaximumObservedWallTime ?? null,
      pendingNamespace: namespace,
      pendingSnapshotBaseSequence: baseSequence,
      pendingAppliedThroughSequence: baseSequence,
      pendingCursor: null,
      pendingVault: vault,
      pendingAuthority: null,
      pendingStoredBytes: 0,
    } satisfies CachedVaultState
    await this.putWithinProfileQuota(transaction, done, store, nextState)
    await done
  }

  async applySnapshotPage(userId: string, vaultId: string, namespace: string, page: MemberSnapshotPage): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const vaultStore = transaction.objectStore(VAULT_STORE)
    const id = scopeId(userId, vaultId)
    const state = await request(vaultStore.get(id)) as CachedVaultState | undefined
    if (!state || state.pendingNamespace !== namespace) {
      return abortTransaction(transaction, done, new Error('stale Vault snapshot namespace'))
    }
    const byteDelta = await applyItems(transaction.objectStore(ITEM_STORE), scopeNamespace(userId, vaultId, namespace), page.items)
    const nextState = {
      ...state,
      pendingCursor: page.nextCursor,
      pendingAuthority: { accessContext: page.accessContext, memberVaultKey: page.memberVaultKey },
      pendingStoredBytes: (state.pendingStoredBytes ?? 0) + byteDelta,
    }
    await this.putWithinProfileQuota(transaction, done, vaultStore, nextState)
    await done
  }

  async applyPendingDeltaPage(userId: string, vaultId: string, namespace: string, expectedSequence: string, page: MemberDeltaPage): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const vaultStore = transaction.objectStore(VAULT_STORE)
    const id = scopeId(userId, vaultId)
    const state = await request(vaultStore.get(id)) as CachedVaultState | undefined
    if (!state || state.pendingNamespace !== namespace || state.pendingAppliedThroughSequence !== expectedSequence) {
      return abortTransaction(transaction, done, new Error('Vault pending delta cursor changed concurrently'))
    }
    const byteDelta = await applyItems(transaction.objectStore(ITEM_STORE), scopeNamespace(userId, vaultId, namespace), page.items)
    const nextState = {
      ...state,
      pendingAppliedThroughSequence: page.appliedThroughSequence,
      pendingAuthority: { accessContext: page.accessContext, memberVaultKey: page.memberVaultKey },
      pendingStoredBytes: (state.pendingStoredBytes ?? 0) + byteDelta,
    }
    await this.putWithinProfileQuota(transaction, done, vaultStore, nextState)
    await done
  }

  async completeSnapshot(userId: string, vault: EncryptedVaultSummary, namespace: string, appliedThroughSequence: string): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore(VAULT_STORE)
    const id = scopeId(userId, vault.id)
    const state = await request(store.get(id)) as CachedVaultState | undefined
    if (!state || state.pendingNamespace !== namespace
      || state.pendingAppliedThroughSequence !== appliedThroughSequence || !state.pendingAuthority) {
      return abortTransaction(transaction, done, new Error('Vault snapshot completion cursor mismatch'))
    }
    const previousNamespace = state.activeNamespace
    const issuedAt = Date.parse(state.pendingAuthority.accessContext.issuedAt)
    const nextState = {
      ...state,
      activeNamespace: namespace,
      activeAppliedThroughSequence: appliedThroughSequence,
      activeVault: vault,
      activeAuthority: state.pendingAuthority,
      activeStoredBytes: state.pendingStoredBytes ?? 0,
      activeMaximumObservedWallTime: Math.max(state.activeMaximumObservedWallTime ?? issuedAt, issuedAt),
      pendingNamespace: null,
      pendingSnapshotBaseSequence: null,
      pendingAppliedThroughSequence: null,
      pendingCursor: null,
      pendingVault: null,
      pendingAuthority: null,
      pendingStoredBytes: 0,
    }
    if (previousNamespace && previousNamespace !== namespace) {
      await deleteNamespaceFromStore(
        transaction.objectStore(ITEM_STORE),
        scopeNamespace(userId, vault.id, previousNamespace),
      )
    }
    await this.putWithinProfileQuota(transaction, done, store, nextState)
    await done
  }

  async applyActiveDeltaPage(userId: string, vault: EncryptedVaultSummary, expectedSequence: string, page: MemberDeltaPage): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const vaultStore = transaction.objectStore(VAULT_STORE)
    const id = scopeId(userId, vault.id)
    const state = await request(vaultStore.get(id)) as CachedVaultState | undefined
    if (!state?.activeNamespace || state.activeAppliedThroughSequence !== expectedSequence) {
      return abortTransaction(transaction, done, new Error('Vault active delta cursor changed concurrently'))
    }
    const byteDelta = await applyItems(transaction.objectStore(ITEM_STORE), scopeNamespace(userId, vault.id, state.activeNamespace), page.items)
    const issuedAt = Date.parse(page.accessContext.issuedAt)
    const nextState = {
      ...state,
      activeAppliedThroughSequence: page.appliedThroughSequence,
      activeVault: vault,
      activeAuthority: { accessContext: page.accessContext, memberVaultKey: page.memberVaultKey },
      activeStoredBytes: (state.activeStoredBytes ?? 0) + byteDelta,
      activeMaximumObservedWallTime: Math.max(state.activeMaximumObservedWallTime ?? issuedAt, issuedAt),
    }
    await this.putWithinProfileQuota(transaction, done, vaultStore, nextState)
    await done
  }

  async validateAndObserveActiveClock(
    userId: string,
    vaultId: string,
    namespace: string,
    expectedAppliedThroughSequence: string,
    expectedAuthority: CachedMemberSyncAuthority,
    currentWallTime: number,
    candidateMaximumWallTime: number,
    maximumRollbackMs: number,
  ): Promise<number> {
    const database = await this.getDatabase()
    const transaction = database.transaction(VAULT_STORE, 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore(VAULT_STORE)
    const state = await request(store.get(scopeId(userId, vaultId))) as CachedVaultState | undefined
    if (!matchesActiveGeneration(
      state,
      namespace,
      expectedAppliedThroughSequence,
      expectedAuthority,
    )) {
      return abortTransaction(transaction, done, new Error('Vault active generation changed while validating its lease'))
    }
    const issuedAt = Date.parse(state.activeAuthority.accessContext.issuedAt)
    const previousMaximum = state.activeMaximumObservedWallTime ?? issuedAt
    if (currentWallTime < previousMaximum - maximumRollbackMs) {
      return abortTransaction(transaction, done, new Error('Current Member Entry clock rollback exceeds the allowed tolerance'))
    }
    const nextMaximum = Math.max(previousMaximum, candidateMaximumWallTime)
    await request(store.put({ ...state, activeMaximumObservedWallTime: nextMaximum }))
    await done
    return nextMaximum
  }

  async removeActiveGeneration(
    userId: string,
    vaultId: string,
    expected: ActiveCacheState,
  ): Promise<boolean> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const vaultStore = transaction.objectStore(VAULT_STORE)
    const id = scopeId(userId, vaultId)
    const state = await request(vaultStore.get(id)) as CachedVaultState | undefined
    if (!matchesActiveGeneration(
      state,
      expected.namespace,
      expected.appliedThroughSequence,
      expected.authority,
    )) {
      await done
      return false
    }
    await deleteNamespaceFromStore(
      transaction.objectStore(ITEM_STORE),
      scopeNamespace(userId, vaultId, state.activeNamespace),
    )
    await request(vaultStore.put({
      ...state,
      activeNamespace: null,
      activeAppliedThroughSequence: null,
      activeVault: null,
      activeAuthority: null,
      activeStoredBytes: 0,
      activeMaximumObservedWallTime: null,
    } satisfies CachedVaultState))
    await done
    return true
  }

  async removeVault(userId: string, vaultId: string): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const store = transaction.objectStore(VAULT_STORE)
    const itemStore = transaction.objectStore(ITEM_STORE)
    const id = scopeId(userId, vaultId)
    await deleteNamespacePrefixFromStore(itemStore, `${id}:`)
    await request(store.delete(id))
    await done
  }

  async removeUser(userId: string): Promise<void> {
    const database = await this.getDatabase()
    const transaction = database.transaction([VAULT_STORE, ITEM_STORE], 'readwrite')
    const done = transactionDone(transaction)
    const vaultStore = transaction.objectStore(VAULT_STORE)
    const itemStore = transaction.objectStore(ITEM_STORE)
    const states = await request(vaultStore.index(USER_INDEX).getAll(userId)) as CachedVaultState[]
    await deleteNamespacePrefixFromStore(itemStore, `${userId}:`)
    for (const state of states) {
      await request(vaultStore.delete(state.scopeId))
    }
    await done
  }

  async removeMissingVaults(userId: string, retainedVaultIds: ReadonlySet<string>): Promise<void> {
    const database = await this.getDatabase()
    const readTransaction = database.transaction(VAULT_STORE, 'readonly')
    const readDone = transactionDone(readTransaction)
    const states = await request(readTransaction.objectStore(VAULT_STORE).index(USER_INDEX).getAll(userId)) as CachedVaultState[]
    await readDone
    for (const state of states) {
      if (retainedVaultIds.has(state.vaultId)) continue
      await this.removeVault(userId, state.vaultId)
    }
  }
}

export const memberSyncCache = typeof indexedDB === 'undefined'
  ? null
  : new IndexedDbMemberSyncCache()

if (memberSyncCache) {
  registerClientProfileCleanup((userId) => memberSyncCache.removeUser(userId))
}
