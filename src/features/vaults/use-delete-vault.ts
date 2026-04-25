import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteVault } from './api/vault-api'
import { VAULTS_QUERY_KEY } from './use-vaults'

export function useDeleteVault() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteVault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
    },
  })
}
