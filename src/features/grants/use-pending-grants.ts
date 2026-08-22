import { useQuery } from '@tanstack/react-query'
import { getPendingGrants } from './api/pending-grants-api'
import { PENDING_GRANTS_QUERY_KEY } from './query-keys'

/**
 * Cross-vault list of GRANULAR grants awaiting the user's approval.
 *
 * `enabled` lets callers (e.g. the sidebar badge) gate the fetch on the
 * GrantManage permission so users without it never trigger a 403. Shares the
 * `['grants','pending']` key, so SignalR's `grant_pending` invalidation keeps
 * any consumer — list view or badge — live.
 */
export function usePendingGrants(enabled = true) {
  return useQuery({
    queryKey: PENDING_GRANTS_QUERY_KEY,
    queryFn: getPendingGrants,
    staleTime: 15_000,
    enabled,
  })
}
