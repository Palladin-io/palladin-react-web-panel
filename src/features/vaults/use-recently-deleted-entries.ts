import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { destroyCanonicalEntry, getRecentlyDeletedEntries } from './api/vault-api'
import { useMemberSyncStore } from './sync/member-sync-store'
import { entriesQueryKey } from './use-entries'
import { authenticatedQueryKey, useAuthenticatedQueryKey } from '../auth'

export function recentlyDeletedQueryKey(vaultId: string) {
  return [...entriesQueryKey(vaultId), 'recently-deleted'] as const
}

export function useRecentlyDeletedEntries(vaultId: string, enabled: boolean) {
  const queryKey = useAuthenticatedQueryKey(recentlyDeletedQueryKey(vaultId))
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => getRecentlyDeletedEntries(vaultId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 30_000,
  })
}

export function useDestroyEntry(vaultId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => destroyCanonicalEntry(vaultId, entryId),
    onSuccess: async (_, entryId) => {
      // Reconcile only after the server transaction commits. The endpoint is
      // idempotent, so retrying an ambiguous transport failure remains safe.
      useMemberSyncStore.getState().reconcileEntry(vaultId, { entryId, tombstone: true })
      await queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(entriesQueryKey(vaultId)),
      })
      useMemberSyncStore.getState().retry()
    },
  })
}
