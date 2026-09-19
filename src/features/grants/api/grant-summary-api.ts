import { api } from '../../../shared/api/client'

/**
 * Grant counts per lifecycle status from `GET /api/grants/summary` — a single
 * aggregate (one `GROUP BY` server-side) that backs the dashboard status tiles.
 * Counts only; no secrets, names, or crypto material are ever returned.
 */

export interface GrantSummary {
  pending: number
  active: number
  expired: number
  revoked: number
  consumed: number
  denied: number
}

export async function getGrantSummary(): Promise<GrantSummary> {
  const raw = await api.get('api/grants/summary').json<GrantSummary>()
  return raw
}
