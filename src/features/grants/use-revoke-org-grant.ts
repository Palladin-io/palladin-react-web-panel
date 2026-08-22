import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { revokeGrant } from './api/org-grants-api'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'
import { authenticatedQueryKey } from '../auth'

export interface RevokeOrgGrantInput {
  vaultId: string
  grantId: string
  reason?: string
}

/**
 * Revokes an active grant from the org-grants panel, then refreshes every
 * affected view: the org list, the pending queue, and the approval audit log.
 */
export function useRevokeOrgGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vaultId, grantId, reason }: RevokeOrgGrantInput) =>
      revokeGrant(vaultId, grantId, reason),
    onSuccess: () => {
      for (const queryKey of GRANT_MUTATION_INVALIDATION_KEYS) {
        queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(queryKey) })
      }
    },
  })
}
