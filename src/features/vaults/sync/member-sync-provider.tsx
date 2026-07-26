import { useEffect, useRef, type ReactNode } from 'react'
import { IndexedDbMemberSyncCache } from './member-sync-cache'
import { MemberSyncEngine } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'

const memberSyncEngine = typeof indexedDB === 'undefined'
  ? null
  : new MemberSyncEngine(new IndexedDbMemberSyncCache())
const MEMBER_DELTA_POLL_INTERVAL_MS = 60_000

interface MemberSyncProviderProps {
  children: ReactNode
  enabled: boolean
  userId: string | null
  memberPrivateKey: Uint8Array | null
}

export function MemberSyncProvider({ children, enabled, userId, memberPrivateKey }: MemberSyncProviderProps) {
  const retryGeneration = useMemberSyncStore((state) => state.retryGeneration)
  const retrySync = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!memberSyncEngine || !enabled || !userId || !memberPrivateKey) {
      useMemberSyncStore.getState().clear()
      return
    }

    let active: AbortController | null = null
    const synchronize = (replaceActive = true) => {
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
      retrySync.current = null
      active?.abort()
      window.clearInterval(pollTimer)
      window.removeEventListener('online', synchronizeWhenOnline)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
      useMemberSyncStore.getState().clear()
    }
  }, [enabled, memberPrivateKey, userId])

  useEffect(() => {
    if (retryGeneration > 0) retrySync.current?.()
  }, [retryGeneration])

  return children
}
