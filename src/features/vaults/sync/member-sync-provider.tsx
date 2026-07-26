import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '../../auth'
import { IndexedDbMemberSyncCache } from './member-sync-cache'
import { MemberSyncEngine } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'

const memberSyncEngine = typeof indexedDB === 'undefined'
  ? null
  : new MemberSyncEngine(new IndexedDbMemberSyncCache())
const MEMBER_DELTA_POLL_INTERVAL_MS = 60_000

export function MemberSyncProvider({ children }: { children: ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const userId = useAuthStore((state) => state.userId)
  const privateKey = useAuthStore((state) => state.privateKey)
  const isVaultLocked = useAuthStore((state) => state.isVaultLocked)

  useEffect(() => {
    if (!memberSyncEngine || !accessToken || !userId || !privateKey || isVaultLocked) {
      useMemberSyncStore.getState().clear()
      return
    }

    let active: AbortController | null = null
    const synchronize = (replaceActive = true) => {
      if (active && !replaceActive) return
      active?.abort()
      const controller = new AbortController()
      active = controller
      void memberSyncEngine.synchronize(userId, privateKey, controller.signal)
        .catch(() => {})
        .finally(() => {
          if (active === controller) active = null
        })
    }
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize()
    }
    const synchronizeWhenOnline = () => synchronize()

    synchronize()
    window.addEventListener('online', synchronizeWhenOnline)
    document.addEventListener('visibilitychange', synchronizeWhenVisible)
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) synchronize(false)
    }, MEMBER_DELTA_POLL_INTERVAL_MS)
    return () => {
      active?.abort()
      window.clearInterval(pollTimer)
      window.removeEventListener('online', synchronizeWhenOnline)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
      useMemberSyncStore.getState().clear()
    }
  }, [accessToken, isVaultLocked, privateKey, userId])

  return children
}
