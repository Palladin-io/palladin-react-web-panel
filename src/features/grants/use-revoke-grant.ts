import { useMutation, useQueryClient } from '@tanstack/react-query'
import { revokeGrant } from './api/grants-api'
import {
  GRANTS_QUERY_KEY,
  PENDING_GRANTS_QUERY_KEY,
  grantDetailQueryKey,
} from './query-keys'

export interface RevokeGrantInput {
  vaultId: string
  grantId: string
  reason?: string
}

/**
 * Revokes a grant and refreshes every grant view: the broad grants tree
 * (which covers all per-vault lists), the pending queue, and the affected
 * grant's detail.
 */
export function useRevokeGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vaultId, grantId, reason }: RevokeGrantInput) =>
      revokeGrant(vaultId, grantId, reason),
    onSuccess: (_data, { vaultId, grantId }) => {
      queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: PENDING_GRANTS_QUERY_KEY })
      queryClient.invalidateQueries({
        queryKey: grantDetailQueryKey(vaultId, grantId),
      })
    },
  })
}
