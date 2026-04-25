import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVault } from './api/vault-api'
import type { UpdateVaultInput } from './types'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

export function useUpdateVault(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateVaultInput) => updateVault(id, input),
    onSuccess: () => {
      // The list cache holds a stale copy of this vault's name/icon/etc,
      // and the detail cache is now also stale. Invalidate both so any
      // mounted screens refetch on next focus.
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(id) })
    },
  })
}
