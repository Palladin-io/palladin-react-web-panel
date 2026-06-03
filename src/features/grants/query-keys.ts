/**
 * Query keys for the grants feature.
 *
 * Centralised so list/detail hooks, mutations, and real-time notification
 * invalidation all reference the exact same key shapes.
 */

/** Root key for all grant queries (broad invalidation target). */
export const GRANTS_QUERY_KEY = ['grants'] as const

/** Pending grants (the cross-vault approval queue surfaced on the dashboard). */
export const PENDING_GRANTS_QUERY_KEY = ['grants', 'pending'] as const
