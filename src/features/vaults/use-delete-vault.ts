import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteVault, type VaultListResponse } from './api/vault-api'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'

export function useDeleteVault() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteVault(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<VaultListResponse>(VAULTS_QUERY_KEY, (old) =>
        old ? { ...old, vaults: old.vaults.filter((v) => v.id !== id) } : old,
      )
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      useMemberSyncStore.getState().retry()
    },
  })
}
