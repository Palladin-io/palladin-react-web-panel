import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'
import { updateEncryptedVaultSettings, type EditableVaultMetadata } from './vault-settings-service'
import { authenticatedQueryKey } from '../auth'

export interface UpdateVaultSettingsInput {
  expectedMetadata: EditableVaultMetadata
  nextMetadata: EditableVaultMetadata
  iconFile?: File
}

export function useUpdateVault(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateVaultSettingsInput) => updateEncryptedVaultSettings({ vaultId: id, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(VAULTS_QUERY_KEY) })
      queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(vaultQueryKey(id)),
      })
      useMemberSyncStore.getState().retry()
    },
    onError: () => {
      // A conflict or generation change must refresh the authenticated local
      // projection before the Member reviews and retries; never auto-merge.
      useMemberSyncStore.getState().retry()
    },
  })
}
