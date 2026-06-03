import { useMutation, useQueryClient } from '@tanstack/react-query'
import { denyGrant } from './api/pending-grants-api'
import { GRANTS_QUERY_KEY, PENDING_GRANTS_QUERY_KEY } from './query-keys'

export interface DenyGrantInput {
  vaultId: string
  grantId: string
  reason?: string
}

/** Denies a pending grant and refreshes the pending queue + grants tree. */
export function useDenyGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ vaultId, grantId, reason }: DenyGrantInput) =>
      denyGrant(vaultId, grantId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PENDING_GRANTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
    },
  })
}
