import { useAuthStore } from '../../auth'
import { isManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'
import { clearPendingEntryShare, readPendingEntryShare, subscribePendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'
import type { ReceptionOperation, ReceptionState } from './reception-state'

interface Continuation {
  operation: ReceptionOperation
  state: ReceptionState
  userId: string | null
  organizationId: string | null
  stop: () => void
}
let pending: Continuation | null = null

export function holdsReception(operation: ReceptionOperation): boolean { return pending?.operation === operation }

function clearContinuation() {
  const owned = pending
  if (!owned) return
  pending = null
  owned.stop()
  owned.operation.controller.abort()
  owned.operation.session = undefined
  owned.state = { ...owned.state, snapshot: null }
  clearTimeout(owned.operation.timer)
  if (readPendingEntryShare(owned.operation.link.shareId) === owned.operation.link) clearPendingEntryShare()
}

export function readReceptionContinuation(shareId: string): Readonly<Continuation> | null {
  const owned = pending
  if (!owned) return null
  const operation = owned.operation
  if (operation.controller.signal.aborted || readPendingEntryShare(operation.link.shareId) !== operation.link
    || Date.now() >= operation.wallDeadline || performance.now() >= operation.monotonicDeadline) {
    clearContinuation()
    return null
  }
  return operation.link.shareId === shareId ? owned : null
}

export function takeReceptionContinuation(shareId: string): Readonly<Continuation> | null {
  const owned = readReceptionContinuation(shareId)
  if (!owned) return null
  pending = null
  owned.stop()
  return owned
}

export function retainReception(operation: ReceptionOperation, state: ReceptionState): boolean {
  if (pending || operation.busy || operation.controller.signal.aborted || state.phase === 'unavailable'
    || readPendingEntryShare(operation.link.shareId) !== operation.link
    || Date.now() >= operation.wallDeadline || performance.now() >= operation.monotonicDeadline) return false
  const auth = useAuthStore.getState()
  const owned: Continuation = { operation, state, userId: auth.userId,
    organizationId: organizationIdFromAccessToken(auth.accessToken), stop: () => {} }
  pending = owned
  const stopIngress = subscribePendingEntryShare(clearContinuation)
  const stopAuth = useAuthStore.subscribe((current, previous) => {
    if (pending !== owned) return
    // Only an explicit login submission may clear an anonymous auth shell without ending this transfer.
    if (!owned.userId && !current.userId && isManualLoginCleanup()) return
    if (owned.userId && current.userId !== owned.userId) { clearContinuation(); return }
    if (!owned.userId && current.userId) owned.userId = current.userId
    const organizationId = organizationIdFromAccessToken(current.accessToken)
    if (owned.organizationId && organizationId !== owned.organizationId) { clearContinuation(); return }
    owned.organizationId ??= organizationId
    if (current.cryptoSessionGeneration !== previous.cryptoSessionGeneration
      && (current.isVaultLocked || !previous.isVaultLocked)) clearContinuation()
  })
  owned.stop = () => { stopIngress(); stopAuth() }
  return true
}

export function guardReceptionContinuation(href: string): void {
  const owned = pending
  if (!owned || !readReceptionContinuation(owned.operation.link.shareId)) return
  const target = `/share/${owned.operation.link.shareId}`
  try {
    const url = new URL(href, window.location.origin)
    if (url.origin === window.location.origin && !url.hash && (
      url.pathname === target && !url.search
      || ['/login', '/register', '/unlock', '/verify-email'].includes(url.pathname)
        && url.searchParams.get('redirect') === target
        && [...url.searchParams.keys()].every((key) => key === 'redirect')
        && url.searchParams.getAll('redirect').length === 1
    )) return
  } catch { /* Navigation outside the exact continuation path releases its capability. */ }
  clearContinuation()
}
