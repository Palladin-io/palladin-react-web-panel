import { useMutation, useQueryClient } from '@tanstack/react-query'
import { revokeGrant } from './api/grants-api'
import { GRANTS_QUERY_KEY } from './query-keys'

export interface RevokeGrantInput {
  vaultId: string
  grantId: string
  reason?: string
}

/**
 * Revokes a grant and refreshes every grant view. Invalidating the `['grants']`
 * root prefix-matches the pending queue, per-vault lists, and the affected
 * grant's detail in one shot.
 */
export function useRevokeGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vaultId, grantId, reason }: RevokeGrantInput) =>
      revokeGrant(vaultId, grantId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
    },
  })
}
