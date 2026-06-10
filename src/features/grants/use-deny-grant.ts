import { useMutation, useQueryClient } from '@tanstack/react-query'
import { denyGrant } from './api/pending-grants-api'
import { GRANTS_QUERY_KEY } from './query-keys'

export interface DenyGrantInput {
  vaultId: string
  grantId: string
  reason?: string
}

/** Denies a pending grant and refreshes every grant view (prefix invalidation). */
export function useDenyGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vaultId, grantId, reason }: DenyGrantInput) =>
      denyGrant(vaultId, grantId, reason),
    onSuccess: () => {
      // Invalidating the grants root refreshes pending queue + org-grants list.
      queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
    },
  })
}
