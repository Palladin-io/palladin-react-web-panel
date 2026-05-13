import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateEntry } from './api/vault-api'
import type { EntryContent } from './types'
import { entriesQueryKey, entryDetailQueryKey } from './use-entries'

export interface UpdateEntryInput {
  label?: string
  description?: string
  icon?: string
  urlDomain?: string
  content?: EntryContent
}

/**
 * PATCH the unencrypted metadata of an entry — label, description,
 * icon, urlDomain. The encrypted blob is never touched here; secret
 * rotation will live in its own dedicated flow.
 *
 * Invalidates both the detail cache (so the open page rehydrates with
 * the fresh metadata) and the list cache (so the row on the vault
 * detail page reflects the new label/icon next time it mounts).
 */
export function useUpdateEntry(vaultId: string, entryId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateEntryInput) => updateEntry(vaultId, entryId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryDetailQueryKey(vaultId, entryId) })
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) })
    },
  })
}
