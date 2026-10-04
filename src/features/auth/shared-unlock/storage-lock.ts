export type SharedUnlockStorageScope = 'pause' | 'links' | 'expiry'
export type StorageFence = () => void
export type StorageExclusive = <T>(action: (assertHeld?: StorageFence) => Promise<T>) => Promise<T>
const scopes: SharedUnlockStorageScope[] = ['pause', 'links', 'expiry']
const databaseName = 'palladin.shared-unlock.locks.v1'
const unavailable = () => new Error('Shared unlock storage lock unavailable')

class StorageLease {
  private readonly transaction: IDBTransaction
  private readonly isFinished: () => boolean
  constructor(transaction: IDBTransaction, isFinished: () => boolean) {
    this.transaction = transaction; this.isFinished = isFinished
  }

  run<T>(scope: SharedUnlockStorageScope, action: (assertHeld: StorageFence) => Promise<T>): Promise<T> {
    const assertHeld = () => {
      if (this.isFinished()) throw unavailable()
      // A request synchronously rejects an aborted, completed or inactive transaction.
      // No timer, renewable lease or keepalive may turn stale ownership into authority.
      this.transaction.objectStore(scope).count()
    }
    assertHeld()
    return action(assertHeld)
  }
}
export type SharedUnlockStorageLease = StorageLease

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(unavailable())
  return new Promise((resolve, reject) => {
    let rejected = false
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => { for (const scope of scopes) request.result.createObjectStore(scope) }
    request.onerror = request.onblocked = () => { rejected = true; reject(unavailable()) }
    request.onsuccess = () => {
      const db = request.result
      if (rejected) { db.close(); return }
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

async function withIndexedDbLocks<T>(selected: SharedUnlockStorageScope[], action: (lease: StorageLease) => Promise<T>): Promise<T> {
  const db = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(selected, 'readwrite')
      let finished = false
      let completed = false
      let value: T
      const lease = new StorageLease(transaction, () => finished)
      const fail = (error: unknown) => {
        finished = true
        try { transaction.abort() } catch { /* Already completed or aborted. */ }
        reject(error)
      }
      transaction.onabort = transaction.onerror = () => fail(unavailable())
      transaction.oncomplete = () => {
        finished = true
        if (completed) resolve(value)
        else reject(unavailable())
      }
      const ready = transaction.objectStore(selected[0]).count()
      ready.onsuccess = () => {
        if (finished) return
        // Production callbacks only await already-resolved localStorage operations.
        // Crossing an event-loop task loses this transaction and fails every fence.
        void Promise.resolve().then(() => action(lease)).then(result => {
          value = result
          completed = true
        }, fail)
      }
    })
  } finally { db.close() }
}

export function withSharedUnlockStorageLock<T>(scope: SharedUnlockStorageScope,
  action: (assertHeld?: StorageFence) => Promise<T>): Promise<T> {
  if (globalThis.navigator?.locks) {
    return navigator.locks.request(`palladin.shared-unlock.${scope}.v1`, () => action()).then(value => value)
  }
  return withIndexedDbLocks([scope], lease => lease.run(scope, action))
}

/** HTTP takes all three scopes in one transaction. Nested stores explicitly use
 * that lease, without waiting behind their own later queued writers. */
export function withSharedUnlockPublicationLocks<T>(action: (lease?: SharedUnlockStorageLease) => Promise<T>): Promise<T> {
  if (globalThis.navigator?.locks) return action()
  return withIndexedDbLocks(scopes, action)
}
