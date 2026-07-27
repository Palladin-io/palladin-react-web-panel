import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateVault } from './api/vault-api'
import type { UpdateVaultInput } from './types'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useAuthStore } from '../auth'
import { sealMemberVaultMetadata } from '../../shared/crypto/vault-protocol'

export function useUpdateVault(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateVaultInput) => {
      const vault = queryClient.getQueryData<import('./types').Vault>(vaultQueryKey(id))
      const vaultKey = useAuthStore.getState().getVaultKey(id)
      if (!vault || !vaultKey) throw new Error('Vault is locked or metadata is unavailable')
      try {
        const metadata = await sealMemberVaultMetadata(vault, vault.memberVaultMetadata, {
          schema: 'palladin.member-vault-metadata.v1', name: input.name ?? vault.name,
          description: input.description ?? vault.description ?? null,
          icon: input.icon === undefined
            ? (vault.icon ? { kind: 'glyph', value: vault.icon } : null)
            : (input.icon ? { kind: 'glyph', value: input.icon } : null),
          color: input.color ?? vault.color ?? null,
          grantMode: (input.grantMode ?? vault.grantMode) === 1 ? 'full' : 'granular',
        }, vaultKey)
        await updateVault(id, metadata)
      } finally { vaultKey.fill(0) }
    },
    onSuccess: () => {
      // The list cache holds a stale copy of this vault's name/icon/etc,
      // and the detail cache is now also stale. Invalidate both so any
      // mounted screens refetch on next focus.
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(id) })
    },
  })
}
