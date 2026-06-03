import { useQuery } from '@tanstack/react-query'
import { getVaultGrants, type GrantStatus } from './api/grants-api'
import { vaultGrantsQueryKey } from './query-keys'

export interface UseVaultGrantsParams {
  status?: GrantStatus
  agentId?: string
}

/**
 * Lists grants for a single vault, filtered by status / agent.
 *
 * Server state only — filters live in the query key so switching a filter
 * fetches (and caches) a distinct page. Pagination cursor is intentionally
 * not wired yet; the management list shows the first page until a "load more"
 * surface is needed.
 */
export function useVaultGrants(vaultId: string, params: UseVaultGrantsParams = {}) {
  return useQuery({
    queryKey: vaultGrantsQueryKey(vaultId, params),
    queryFn: () => getVaultGrants(vaultId, params),
    staleTime: 30_000,
    enabled: Boolean(vaultId),
  })
}
