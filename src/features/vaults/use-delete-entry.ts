import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteEntry } from './api/vault-api'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'

/**
 * Delete an entry from a vault. Returns the standard TanStack mutation
 * — the page wires `onSuccess`/`onError` to drive navigation and toast
 * feedback. The vault summary's entryCount is invalidated alongside the
 * list so the detail header subtitle stays accurate after the user
 * navigates back.
 */
export function useDeleteEntry(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (entryId: string) => deleteEntry(vaultId, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(vaultId) })
      // Keep the vault list's per-vault `entryCount` in sync (dashboard
      // onboarding + summaries) — it sits under a sibling query key.
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
    },
  })
}
