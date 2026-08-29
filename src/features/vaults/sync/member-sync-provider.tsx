import { useEffect, useRef, type ReactNode } from 'react'
import { memberSyncCache } from './member-sync-cache'
import { MemberSyncEngine } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'
import { DefaultVaultReconciler } from './default-vault-reconciler'
import { AGENT_DISCOVERY_RECONCILE_EVENT, reconcileAgentDiscovery } from './agent-discovery-reconciler'
import { purgeInvalidMemberSyncGenerations } from './member-sync-lifecycle'

const memberSyncEngine = memberSyncCache ? new MemberSyncEngine(memberSyncCache) : null
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
  const retrySync = useRef<(() => void) | null>(null)
  const synchronizationQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    if (!memberSyncEngine || !enabled || !userId || !memberPrivateKey) {
      useMemberSyncStore.getState().clear()
      return
    }

    let active: AbortController | null = null
    let activeCompletion: Promise<void> | null = null
    let leaseTimer: number | null = null
    let leaseScheduleGeneration = 0
    let disposed = false
    const scheduleLeaseExpiry = async (connected?: boolean) => {
      const generation = ++leaseScheduleGeneration
      if (leaseTimer !== null) window.clearTimeout(leaseTimer)
      leaseTimer = null
      const earliestNotAfter = await purgeInvalidMemberSyncGenerations(
        userId,
        new Date(),
        memberSyncCache,
        connected,
      )
      if (disposed || generation !== leaseScheduleGeneration || earliestNotAfter === null) return
      leaseTimer = window.setTimeout(() => {
        leaseTimer = null
        void scheduleLeaseExpiry().catch(() => undefined)
      }, Math.max(0, earliestNotAfter - Date.now()))
    }
    const synchronize = (replaceActive = true) => {
      if (activeCompletion && !replaceActive) return
      const previousCompletion = synchronizationQueue.current
      active?.abort()
      const controller = new AbortController()
      active = controller
      const completion = (async () => {
        if (previousCompletion) await previousCompletion
        if (disposed || controller.signal.aborted) return
        await memberSyncEngine.synchronize(userId, memberPrivateKey, controller.signal)
        if (disposed || controller.signal.aborted) return
        await scheduleLeaseExpiry()
      })()
        .catch(() => {})
        .finally(() => {
          if (activeCompletion !== completion) return
          active = null
          activeCompletion = null
        })
      activeCompletion = completion
      synchronizationQueue.current = completion
    }
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize()
    }
    const synchronizeWhenOnline = () => synchronize()
    const purgeWhenOffline = () => {
      void scheduleLeaseExpiry(false).catch(() => undefined)
    }

    retrySync.current = synchronize
    void scheduleLeaseExpiry().catch(() => undefined)
    synchronize()
    window.addEventListener('online', synchronizeWhenOnline)
    window.addEventListener('offline', purgeWhenOffline)
    document.addEventListener('visibilitychange', synchronizeWhenVisible)
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) synchronize(false)
    }, MEMBER_DELTA_POLL_INTERVAL_MS)
    return () => {
      disposed = true
      leaseScheduleGeneration += 1
      retrySync.current = null
      active?.abort()
      if (leaseTimer !== null) window.clearTimeout(leaseTimer)
      window.clearInterval(pollTimer)
      window.removeEventListener('online', synchronizeWhenOnline)
      window.removeEventListener('offline', purgeWhenOffline)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
      useMemberSyncStore.getState().clear()
    }
  }, [enabled, memberPrivateKey, userId])

  useEffect(() => {
    if (retryGeneration > 0) retrySync.current?.()
  }, [retryGeneration])

  useEffect(() => {
    if (!enabled || !memberPrivateKey) return
    let active: AbortController | null = null
    let rerunRequested = false
    let disposed = false
    const reconcile = () => {
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
      disposed = true
      rerunRequested = false
      active?.abort()
      window.clearInterval(timer)
      window.removeEventListener(AGENT_DISCOVERY_RECONCILE_EVENT, reconcile)
      window.removeEventListener('online', reconcile)
      document.removeEventListener('visibilitychange', reconcileWhenVisible)
    }
  }, [enabled, memberPrivateKey])

  return (
    <>
      <DefaultVaultReconciler enabled={enabled} memberPrivateKey={memberPrivateKey} />
      {children}
    </>
  )
}
