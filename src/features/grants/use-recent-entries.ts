import { useAuthStore } from '../auth'
import { useMemberSyncStore } from '../vaults/sync/member-sync-store'
import { useLocalEntrySearch } from './use-local-entry-search'

/**
 * Most recently changed active entries across the Member's synchronized Vaults.
 * Presentation and ordering are resolved in unlocked memory; no Entry query or
 * plaintext projection is sent to the backend.
 */
export function useRecentEntries(limit = 8, enabled = true) {
  const unlocked = useAuthStore((state) => state.privateKey !== null)
  const status = useMemberSyncStore((state) => state.status)
  const retry = useMemberSyncStore((state) => state.retry)
  const active = enabled && unlocked
  const data = useLocalEntrySearch('', limit, 'recent', active)
  return {
    data,
    isPending: active && (status === 'idle' || status === 'syncing'),
    isError: active && status === 'error',
    refetch: retry,
  }
}
