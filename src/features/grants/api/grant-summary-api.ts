import { z } from 'zod'
import { api } from '../../../shared/api/client'

/**
 * Grant counts per lifecycle status from `GET /api/grants/summary` — a single
 * aggregate (one `GROUP BY` server-side) that backs the dashboard status tiles.
 * Counts only; no secrets, names, or crypto material are ever returned.
 */
export const grantSummarySchema = z.object({
  pending: z.number(),
  active: z.number(),
  expired: z.number(),
  revoked: z.number(),
  consumed: z.number(),
  denied: z.number(),
})

export type GrantSummary = z.infer<typeof grantSummarySchema>

export async function getGrantSummary(): Promise<GrantSummary> {
  const raw = await api.get('api/grants/summary').json()
  return grantSummarySchema.parse(raw)
}
