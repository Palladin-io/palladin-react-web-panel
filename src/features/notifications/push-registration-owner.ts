import {
  authenticatedSessionMatches,
  type AuthenticatedSessionSnapshot,
} from '../auth/session/session-boundary'
import { registerAuthenticatedPrincipalReset } from '../../shared/lib/authenticated-principal-reset'
import { deletePushTokenForOwner } from './push-api'

export interface PushRegistrationOwner {
  readonly epoch: number
  readonly session: AuthenticatedSessionSnapshot
  invalidated: boolean
  firebaseToken: string | null
  serverId: string | null
  serverIds: Set<string>
  deferredServerCleanup: Map<string, AuthenticatedSessionSnapshot>
  invalidateFirebase: (() => Promise<unknown>) | null
  firebaseCleanup: Promise<void> | null
  serverCleanup: Map<string, Promise<void>>
}

let currentEpoch = 0
let currentOwner: PushRegistrationOwner | null = null
let firebaseLifecycleQueue: Promise<void> = Promise.resolve()
let serverLifecycleQueue: Promise<void> = Promise.resolve()

function serializeFirebaseLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = firebaseLifecycleQueue.then(operation, operation)
  firebaseLifecycleQueue = result.then(() => undefined, () => undefined)
  return result
}

function serializeServerLifecycle<T>(operation: () => Promise<T>): Promise<T> {
  const result = serverLifecycleQueue.then(operation, operation)
  serverLifecycleQueue = result.then(() => undefined, () => undefined)
  return result
}

function replacementClaimsFirebaseToken(owner: PushRegistrationOwner): boolean {
  return currentOwner !== null
    && currentOwner !== owner
    && !currentOwner.invalidated
    && authenticatedSessionMatches(currentOwner.session)
    && owner.firebaseToken !== null
    && currentOwner.firebaseToken === owner.firebaseToken
}

function transferServerIdToReplacement(
  owner: PushRegistrationOwner,
  serverId: string,
): boolean {
  if (!currentOwner
    || currentOwner === owner
    || currentOwner.invalidated
    || !authenticatedSessionMatches(currentOwner.session)
    || (!currentOwner.serverIds.has(serverId)
      && (!owner.firebaseToken
        || currentOwner.firebaseToken !== owner.firebaseToken))) {
    return false
  }
  // The backend may globally reassign the same FCM token/registration row on
  // an organization switch. Transfer cleanup ownership to B so A cannot
  // delete a record B already claimed (or is about to claim).
  currentOwner.serverIds.add(serverId)
  currentOwner.deferredServerCleanup.set(
    serverId,
    owner.deferredServerCleanup.get(serverId) ?? owner.session,
  )
  return true
}

function startFirebaseCleanup(owner: PushRegistrationOwner): Promise<void> | null {
  if (!owner.invalidateFirebase || owner.firebaseCleanup) return owner.firebaseCleanup
  owner.firebaseCleanup = serializeFirebaseLifecycle(async () => {
    if (replacementClaimsFirebaseToken(owner)) return
    try {
      await owner.invalidateFirebase?.()
    } catch {
      // Local epoch/registry invalidation remains authoritative.
    }
  })
  return owner.firebaseCleanup
}

function startServerCleanup(owner: PushRegistrationOwner): Promise<void>[] {
  const cleanup: Promise<void>[] = []
  for (const serverId of owner.serverIds) {
    const existing = owner.serverCleanup.get(serverId)
    if (existing) {
      cleanup.push(existing)
      continue
    }
    const operation = serializeServerLifecycle(async () => {
      // CAS immediately before DELETE. A current owner with the same FCM token
      // or registration id has inherited the backend row, so deletion would
      // break B. Transfer the id instead; B will clean it on its own boundary.
      if (transferServerIdToReplacement(owner, serverId)) return
      try {
        await deletePushTokenForOwner(
          serverId,
          owner.deferredServerCleanup.get(serverId) ?? owner.session,
        )
      } catch {
        // Best effort; local delivery was already invalidated synchronously.
      }
    })
    owner.serverCleanup.set(serverId, operation)
    cleanup.push(operation)
  }
  return cleanup
}

export function beginPushRegistration(
  session: AuthenticatedSessionSnapshot,
): PushRegistrationOwner {
  if (currentOwner) void invalidatePushRegistration(currentOwner)
  const owner: PushRegistrationOwner = {
    epoch: ++currentEpoch,
    session,
    invalidated: false,
    firebaseToken: null,
    serverId: null,
    serverIds: new Set(),
    deferredServerCleanup: new Map(),
    invalidateFirebase: null,
    firebaseCleanup: null,
    serverCleanup: new Map(),
  }
  currentOwner = owner
  return owner
}

export function pushRegistrationOwnerIsCurrent(owner: PushRegistrationOwner): boolean {
  return currentOwner === owner
    && currentEpoch === owner.epoch
    && !owner.invalidated
    && authenticatedSessionMatches(owner.session)
}

export function acquirePushFirebaseToken(
  owner: PushRegistrationOwner,
  acquire: () => Promise<string>,
  invalidate: () => Promise<unknown>,
): Promise<string | null> {
  return serializeFirebaseLifecycle(async () => {
    if (!pushRegistrationOwnerIsCurrent(owner)) return null
    const token = await acquire()
    owner.firebaseToken = token || null
    owner.invalidateFirebase = invalidate
    if (!token) return null
    if (pushRegistrationOwnerIsCurrent(owner)) return token

    // The boundary may have invalidated this owner while getToken was in
    // flight. Complete deletion inside the same serialized lifecycle slot so
    // B cannot acquire/re-register the shared browser token until A is done.
    if (!replacementClaimsFirebaseToken(owner)) {
      try {
        await invalidate()
      } catch {
        // The epoch still prevents this owner from publishing registration.
      }
    }
    owner.firebaseCleanup = Promise.resolve()
    return null
  })
}

/**
 * Serializes registration POSTs with stale-owner DELETEs. In particular, B's
 * POST cannot reach the backend until an in-flight A POST has completed and
 * its cleanup/ownership decision has run, making B the deterministic final
 * writer for a globally reassigned FCM row.
 */
export function registerPushTokenForOwner(
  owner: PushRegistrationOwner,
  register: () => Promise<string>,
): Promise<string | null> {
  return serializeServerLifecycle(async () => {
    if (!pushRegistrationOwnerIsCurrent(owner)) return null
    let serverId: string
    try {
      serverId = await register()
    } catch (error) {
      // B failed before becoming the final writer. Every id inherited from A
      // remains an A-owned backend record and must be deleted with A's exact
      // session before this lifecycle slot releases C/another retry.
      for (const [inheritedId, cleanupSession] of owner.deferredServerCleanup) {
        const cleanup = deletePushTokenForOwner(inheritedId, cleanupSession)
          .catch(() => undefined)
        owner.serverCleanup.set(inheritedId, cleanup)
        await cleanup
        owner.serverIds.delete(inheritedId)
      }
      owner.deferredServerCleanup.clear()
      throw error
    }
    owner.serverId = serverId
    owner.serverIds.add(serverId)
    if (pushRegistrationOwnerIsCurrent(owner)) {
      // POST B is now the final write. The same returned id is the reassigned B
      // row and consumes A's obligation without DELETE; differing inherited
      // ids are still A records and are compensated directly.
      for (const [inheritedId, cleanupSession] of owner.deferredServerCleanup) {
        if (inheritedId === serverId) {
          owner.deferredServerCleanup.delete(inheritedId)
          continue
        }
        const cleanup = deletePushTokenForOwner(inheritedId, cleanupSession)
          .catch(() => undefined)
        owner.serverCleanup.set(inheritedId, cleanup)
        await cleanup
        owner.deferredServerCleanup.delete(inheritedId)
        owner.serverIds.delete(inheritedId)
      }
      return serverId
    }

    // A changed while POST was actually mutating the backend. Resolve the
    // stale write inside this same lifecycle slot before B's queued POST runs.
    // If B owns the same token/id, transfer cleanup responsibility and let B's
    // following POST be the final reassignment. Otherwise compensate now.
    // Resolve every inherited/current write here, before C's queued POST. A
    // same-token successor inherits the still-deferred obligation; otherwise
    // the exact originating owner performs the compensating DELETE now.
    for (const staleId of owner.serverIds) {
      const handled = transferServerIdToReplacement(owner, staleId)
        ? Promise.resolve()
        : deletePushTokenForOwner(
            staleId,
            owner.deferredServerCleanup.get(staleId) ?? owner.session,
          ).catch(() => undefined)
      owner.serverCleanup.set(staleId, handled)
      await handled
    }
    return null
  })
}

export async function invalidatePushRegistration(
  owner: PushRegistrationOwner,
): Promise<void> {
  owner.invalidated = true
  if (currentOwner === owner) {
    currentOwner = null
    currentEpoch += 1
  }
  const cleanup = [
    startFirebaseCleanup(owner),
    ...startServerCleanup(owner),
  ].filter((operation): operation is Promise<void> => operation !== null)
  await Promise.all(cleanup)
}

export function invalidateCurrentPushRegistration(): Promise<void> {
  const owner = currentOwner
  if (!owner) {
    currentEpoch += 1
    return Promise.resolve()
  }
  return invalidatePushRegistration(owner)
}

registerAuthenticatedPrincipalReset(() => {
  // The epoch/local owner is invalidated synchronously. Remote/FCM cleanup is
  // then guaranteed to be started but cannot delay the fail-closed boundary.
  void invalidateCurrentPushRegistration()
})
