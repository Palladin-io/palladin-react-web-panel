/**
 * Query keys for the grants feature.
 *
 * Centralised so list/detail hooks, mutations, and real-time notification
 * invalidation all reference the exact same key shapes — invalidating one
 * place updates every consumer.
 */

/** Root key for all grant queries (broad invalidation target). */
export const GRANTS_QUERY_KEY = ['grants'] as const

/** Pending grants (the cross-vault approval queue surfaced on the dashboard). */
export const PENDING_GRANTS_QUERY_KEY = ['grants', 'pending'] as const

/** Filters accepted by the per-vault grants list endpoint. */
export interface GrantListFilters {
  status?: string
  agentId?: string
}

/** Key for the per-vault grants list, scoped by its active filters. */
export function vaultGrantsQueryKey(vaultId: string, filters: GrantListFilters = {}) {
  return ['grants', 'vault', vaultId, filters] as const
}

/** Key for a single grant's detail. */
export function grantDetailQueryKey(vaultId: string, grantId: string) {
  return ['grants', 'vault', vaultId, 'detail', grantId] as const
}
