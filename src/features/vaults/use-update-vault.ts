import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVault } from './api/vault-api'
import type { UpdateVaultInput } from './types'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'

export function useUpdateVault(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateVaultInput) => updateVault(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(id) })
      useMemberSyncStore.getState().retry()
    },
  })
}
