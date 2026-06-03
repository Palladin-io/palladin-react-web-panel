/**
 * Query keys for the grants feature.
 *
 * The grants feature is not implemented yet (only this key module exists),
 * but real-time notifications already need stable keys to invalidate so the
 * grants list/pending badge refresh the moment a grant changes server-side.
 * Defining the keys here keeps the contract in one place for when the feature
 * lands — consumers (e.g. notifications) import these instead of inlining
 * `['grants']` literals.
 */
export const GRANTS_QUERY_KEY = ['grants'] as const

/** Pending grants (the approval queue surfaced on the dashboard badge). */
export const PENDING_GRANTS_QUERY_KEY = ['grants', 'pending'] as const
