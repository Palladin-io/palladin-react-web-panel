import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { deleteVault, type VaultListResponse } from './api/vault-api'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'
import { authenticatedQueryKey } from '../auth'

export function useDeleteVault() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteVault(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<VaultListResponse>(authenticatedQueryKey(VAULTS_QUERY_KEY), (old) =>
        old ? { ...old, vaults: old.vaults.filter((v) => v.id !== id) } : old,
      )
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(VAULTS_QUERY_KEY) })
      useMemberSyncStore.getState().retry()
    },
  })
}
