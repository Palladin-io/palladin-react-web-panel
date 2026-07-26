/**
 * Query keys for the grants feature.
 *
 * Centralised so list/detail hooks, mutations, and real-time notification
 * invalidation all reference the exact same key shapes — invalidating one
 * place updates every consumer (lists, detail, pending badge, notifications).
 */

/** Root key for all grant queries (broad invalidation target). */
export const GRANTS_QUERY_KEY = ['grants'] as const

/** Pending grants (the cross-vault approval queue surfaced on the dashboard). */
export const PENDING_GRANTS_QUERY_KEY = ['grants', 'pending'] as const

/** Org-wide grants list (Approvals right panel — all statuses). */
export const ORG_GRANTS_QUERY_KEY = ['grants', 'org'] as const

/** Grant counts per status (dashboard metric tiles). */
export const GRANT_SUMMARY_QUERY_KEY = ['grants', 'summary'] as const


/** Approval audit history (Approvals view, when present). */
export const APPROVAL_AUDIT_LOG_QUERY_KEY = ['audit-logs', 'approvals'] as const

/**
 * Keys to invalidate after a grant lifecycle mutation (revoke / proactive
 * grant-again). `GRANTS_QUERY_KEY` is the root prefix that already covers the
 * pending queue, org list, per-vault lists, and detail keys in one shot; the
 * approval audit log lives under a different prefix so it needs its own entry.
 */
export const GRANT_MUTATION_INVALIDATION_KEYS = [
  GRANTS_QUERY_KEY,
  APPROVAL_AUDIT_LOG_QUERY_KEY,
] as const

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
