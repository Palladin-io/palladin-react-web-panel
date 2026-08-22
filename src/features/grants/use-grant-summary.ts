import { useQuery } from '@tanstack/react-query'
import { getGrantSummary } from './api/grant-summary-api'
import { GRANT_SUMMARY_QUERY_KEY } from './query-keys'

/**
 * Grant counts per status for the dashboard metric tiles. `enabled` gates the
 * fetch on the GrantManage permission so users without it never trigger a 403.
 * Shares the `['grants',…]` tree, so SignalR grant lifecycle invalidations
 * refresh the counts live.
 */
export function useGrantSummary(enabled = true) {
  return useQuery({
    queryKey: GRANT_SUMMARY_QUERY_KEY,
    queryFn: getGrantSummary,
    staleTime: 15_000,
    enabled,
  })
}
