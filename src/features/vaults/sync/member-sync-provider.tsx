import { useEffect, useRef, type ReactNode } from 'react'
import { IndexedDbMemberSyncCache } from './member-sync-cache'
import { MemberSyncEngine } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'
import { DefaultVaultReconciler } from './default-vault-reconciler'
import { AGENT_DISCOVERY_RECONCILE_EVENT, reconcileAgentDiscovery } from './agent-discovery-reconciler'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  useAuthStore,
} from '../../auth'
import { registerAuthenticatedPrincipalProducerStop } from '../../../shared/lib/authenticated-principal-reset'

const memberSyncEngine = typeof indexedDB === 'undefined'
  ? null
  : new MemberSyncEngine(new IndexedDbMemberSyncCache())
const MEMBER_DELTA_POLL_INTERVAL_MS = 60_000
const AGENT_DISCOVERY_RECONCILE_INTERVAL_MS = 60_000

interface MemberSyncProviderProps {
  children: ReactNode
  enabled: boolean
  userId: string | null
  memberPrivateKey: Uint8Array | null
}

export function MemberSyncProvider({ children, enabled, userId, memberPrivateKey }: MemberSyncProviderProps) {
  const retryGeneration = useMemberSyncStore((state) => state.retryGeneration)
  const sessionGeneration = useAuthStore((state) => state.sessionGeneration)
  const retrySync = useRef<(() => void) | null>(null)

  useEffect(() => {
    const session = captureAuthenticatedSession()
    if (!memberSyncEngine || !enabled || !userId || !memberPrivateKey
      || session.sessionBoundaryActive) {
      useMemberSyncStore.getState().clear()
      return
    }

    let active: AbortController | null = null
    let stopped = false
    const stop = () => {
      stopped = true
      retrySync.current = null
      active?.abort()
    }
    const unregisterProducerStop = registerAuthenticatedPrincipalProducerStop(stop)
    const synchronize = (replaceActive = true) => {
      if (stopped || !authenticatedSessionMatches(session)) return
      if (active && !replaceActive) return
      active?.abort()
      const controller = new AbortController()
      active = controller
      void memberSyncEngine.synchronize(userId, memberPrivateKey, controller.signal)
        .catch(() => {})
        .finally(() => {
          if (active === controller) active = null
        })
    }
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize()
    }
    const synchronizeWhenOnline = () => synchronize()

    retrySync.current = synchronize
    synchronize()
    window.addEventListener('online', synchronizeWhenOnline)
    document.addEventListener('visibilitychange', synchronizeWhenVisible)
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) synchronize(false)
    }, MEMBER_DELTA_POLL_INTERVAL_MS)
    return () => {
      stop()
      unregisterProducerStop()
      window.clearInterval(pollTimer)
      window.removeEventListener('online', synchronizeWhenOnline)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
      useMemberSyncStore.getState().clear()
    }
  }, [enabled, memberPrivateKey, sessionGeneration, userId])

  useEffect(() => {
    if (retryGeneration > 0) retrySync.current?.()
  }, [retryGeneration])

  useEffect(() => {
    const session = captureAuthenticatedSession()
    if (!enabled || !memberPrivateKey || session.sessionBoundaryActive) return
    let active: AbortController | null = null
    let rerunRequested = false
    let disposed = false
    const stop = () => {
      disposed = true
      rerunRequested = false
      active?.abort()
    }
    const unregisterProducerStop = registerAuthenticatedPrincipalProducerStop(stop)
    const reconcile = () => {
      if (disposed || !authenticatedSessionMatches(session)) return
      if (active) {
        rerunRequested = true
        return
      }
      const controller = new AbortController()
      active = controller
      void reconcileAgentDiscovery(memberPrivateKey, controller.signal)
        .catch((error: unknown) => {
          if (import.meta.env.DEV) console.error('[Agent Discovery] reconciliation failed', error)
        })
        .finally(() => {
          if (active !== controller) return
          active = null
          if (rerunRequested && !disposed) {
            rerunRequested = false
            reconcile()
          }
        })
    }
    const reconcileWhenVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) reconcile()
    }
    reconcile()
    window.addEventListener(AGENT_DISCOVERY_RECONCILE_EVENT, reconcile)
    window.addEventListener('online', reconcile)
    document.addEventListener('visibilitychange', reconcileWhenVisible)
    const timer = window.setInterval(reconcileWhenVisible, AGENT_DISCOVERY_RECONCILE_INTERVAL_MS)
    return () => {
      stop()
      unregisterProducerStop()
      window.clearInterval(timer)
      window.removeEventListener(AGENT_DISCOVERY_RECONCILE_EVENT, reconcile)
      window.removeEventListener('online', reconcile)
      document.removeEventListener('visibilitychange', reconcileWhenVisible)
    }
  }, [enabled, memberPrivateKey, sessionGeneration])

  return (
    <>
      <DefaultVaultReconciler enabled={enabled} memberPrivateKey={memberPrivateKey} />
      {children}
    </>
  )
}
