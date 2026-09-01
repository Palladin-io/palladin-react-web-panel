import {
  assertMemberSyncPageAuthority,
  currentMemberEntryAccessContextSchema,
} from './member-sync-api'
import {
  memberSyncCache,
  type ActiveCacheState,
  type MemberSyncCache,
} from './member-sync-cache'
import { useMemberSyncStore } from './member-sync-store'

const MAXIMUM_CLOCK_ROLLBACK_MS = 5 * 60 * 1_000
const processClockObservations = new Map<string, { monotonicTime: number, wallTime: number }>()

function observationId(userId: string, vaultId: string, namespace: string): string {
  return `${userId}:${vaultId}:${namespace}`
}

function currentMonotonicTime(): number {
  return typeof performance === 'undefined' ? 0 : performance.now()
}

function forgetClockObservation(userId: string, vaultId: string): void {
  const prefix = `${userId}:${vaultId}:`
  for (const key of processClockObservations.keys()) {
    if (key.startsWith(prefix)) processClockObservations.delete(key)
  }
}

export async function assertCurrentMemberLeaseValid(
  cache: MemberSyncCache,
  state: ActiveCacheState,
  userId: string,
  now: Date,
  connected?: boolean,
  monotonicTime = currentMonotonicTime(),
): Promise<number | null> {
  const access = currentMemberEntryAccessContextSchema.parse(state.authority.accessContext)
  assertMemberSyncPageAuthority(state.authority, state.vault, userId)
  const currentTime = now.getTime()
  const issuedAt = Date.parse(access.issuedAt)
  const notAfter = Date.parse(access.notAfter)
  const syncState = useMemberSyncStore.getState()
  const hasConnectedGeneration = connected ?? (
    (typeof navigator === 'undefined' || navigator.onLine)
    && syncState.status !== 'error'
    && syncState.vaults.get(state.vault.id)?.status === 'ready'
  )
  const id = observationId(userId, state.vault.id, state.namespace)
  const previous = processClockObservations.get(id)
  const monotonicWallTime = previous
    ? previous.wallTime + Math.max(0, monotonicTime - previous.monotonicTime)
    : currentTime
  if (currentTime < monotonicWallTime - MAXIMUM_CLOCK_ROLLBACK_MS) {
    throw new Error('Current Member Entry clock rollback exceeds the allowed tolerance')
  }
  const maximumObservedWallTime = await cache.validateAndObserveActiveClock(
    userId,
    state.vault.id,
    state.namespace,
    state.appliedThroughSequence,
    state.authority,
    currentTime,
    Math.max(currentTime, monotonicWallTime),
    MAXIMUM_CLOCK_ROLLBACK_MS,
  )
  processClockObservations.set(id, { monotonicTime, wallTime: maximumObservedWallTime })
  if (currentTime < issuedAt - MAXIMUM_CLOCK_ROLLBACK_MS
    || (access.offlinePolicy === 'disabled' ? !hasConnectedGeneration : maximumObservedWallTime >= notAfter)) {
    throw new Error('Current Member Entry offline lease is not valid')
  }
  return access.offlinePolicy === 'disabled' ? null : notAfter
}

export async function invalidateMemberSyncGeneration(
  cache: MemberSyncCache,
  userId: string,
  vaultId: string,
  expected: ActiveCacheState,
): Promise<boolean> {
  try {
    const removed = await cache.removeActiveGeneration(userId, vaultId, expected)
    if (!removed) return false
    forgetClockObservation(userId, vaultId)
    const store = useMemberSyncStore.getState()
    store.removeVault(vaultId)
    store.fail()
    return true
  } catch (error) {
    forgetClockObservation(userId, vaultId)
    const store = useMemberSyncStore.getState()
    store.removeVault(vaultId)
    store.fail()
    throw error
  }
}

export async function repairMemberSyncGeneration(
  userId: string,
  vaultId: string,
  cache: MemberSyncCache | null = memberSyncCache,
): Promise<boolean> {
  if (!cache) return false
  const active = await cache.getActiveState(userId, vaultId)
  if (!active) {
    useMemberSyncStore.getState().retry()
    return false
  }
  try {
    const removed = await cache.removeActiveGeneration(userId, vaultId, active)
    const store = useMemberSyncStore.getState()
    if (removed) {
      forgetClockObservation(userId, vaultId)
      store.resetVault(vaultId)
    }
    store.retry()
    return removed
  } catch (error) {
    forgetClockObservation(userId, vaultId)
    const store = useMemberSyncStore.getState()
    store.removeVault(vaultId)
    store.fail()
    throw error
  }
}

export async function purgeInvalidMemberSyncGenerations(
  userId: string,
  now = new Date(),
  cache: MemberSyncCache | null = memberSyncCache,
  connected?: boolean,
): Promise<number | null> {
  if (!cache) return null
  const activeStates = await cache.listActiveStates(userId)
  let earliestNotAfter: number | null = null
  let cleanupFailed = false
  for (const state of activeStates) {
    try {
      const notAfter = await assertCurrentMemberLeaseValid(cache, state, userId, now, connected)
      if (notAfter !== null) {
        earliestNotAfter = earliestNotAfter === null ? notAfter : Math.min(earliestNotAfter, notAfter)
      }
    } catch {
      try {
        await invalidateMemberSyncGeneration(cache, userId, state.vault.id, state)
      } catch {
        cleanupFailed = true
      }
    }
  }
  if (cleanupFailed) throw new Error('Invalid Current Member Entry generations could not be deleted')
  return earliestNotAfter
}
