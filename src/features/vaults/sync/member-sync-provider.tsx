import { useEffect, type ReactNode } from 'react'
import { useAuthStore } from '../../auth'
import { IndexedDbMemberSyncCache } from './member-sync-cache'
import { MemberSyncEngine } from './member-sync-engine'
import { useMemberSyncStore } from './member-sync-store'

const memberSyncEngine = typeof indexedDB === 'undefined'
  ? null
  : new MemberSyncEngine(new IndexedDbMemberSyncCache())

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
    const synchronize = () => {
      active?.abort()
      active = new AbortController()
      void memberSyncEngine.synchronize(userId, privateKey, active.signal).catch(() => {})
    }
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize()
    }

    synchronize()
    window.addEventListener('online', synchronize)
    document.addEventListener('visibilitychange', synchronizeWhenVisible)
    return () => {
      active?.abort()
      window.removeEventListener('online', synchronize)
      document.removeEventListener('visibilitychange', synchronizeWhenVisible)
      useMemberSyncStore.getState().clear()
    }
  }, [accessToken, isVaultLocked, privateKey, userId])

  return children
}
