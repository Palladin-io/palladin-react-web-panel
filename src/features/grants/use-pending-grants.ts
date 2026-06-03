import { useQuery } from '@tanstack/react-query'
import { getPendingGrants } from './api/pending-grants-api'
import { PENDING_GRANTS_QUERY_KEY } from './query-keys'

/** Cross-vault list of GRANULAR grants awaiting the user's approval. */
export function usePendingGrants() {
  return useQuery({
    queryKey: PENDING_GRANTS_QUERY_KEY,
    queryFn: getPendingGrants,
    staleTime: 15_000,
  })
}
