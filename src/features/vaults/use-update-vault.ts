import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { MemberVaultMetadata } from '../../shared/crypto/vault-v2-member-sync'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'
import { updateEncryptedVaultSettings } from './vault-settings-service'

export interface UpdateVaultSettingsInput {
  expectedMetadata: MemberVaultMetadata
  nextMetadata: MemberVaultMetadata
  iconFile?: File
}

export function useUpdateVault(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateVaultSettingsInput) => updateEncryptedVaultSettings({ vaultId: id, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(id) })
      useMemberSyncStore.getState().retry()
    },
    onError: () => {
      // A conflict or generation change must refresh the authenticated local
      // projection before the Member reviews and retries; never auto-merge.
      useMemberSyncStore.getState().retry()
    },
  })
}
