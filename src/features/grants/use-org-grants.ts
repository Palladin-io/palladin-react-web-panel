import { useQuery } from '@tanstack/react-query'
import { getOrgGrants, type GetOrgGrantsParams } from './api/org-grants-api'
import { ORG_GRANTS_QUERY_KEY } from './query-keys'

/**
 * Org-wide grants list (all statuses) for the Approvals right panel. Filters
 * live in the query key so each filter combination caches independently.
 *
 * `enabled` gates the fetch on the GrantManage permission so users without it
 * never trigger a 403. Shares the `['grants',…]` tree, so SignalR grant
 * lifecycle invalidations refresh it live.
 */
export function useOrgGrants(params: GetOrgGrantsParams = {}, enabled = true) {
  return useQuery({
    queryKey: [...ORG_GRANTS_QUERY_KEY, params] as const,
    queryFn: () => getOrgGrants(params),
    staleTime: 15_000,
    enabled,
  })
}
