import { z } from 'zod'
import { api } from '../../shared/api/client'

/**
 * A single global-search hit. Mirrors the backend `GET /api/search` contract.
 *
 * NOTE: the backend does NOT return `vaultId` for `entry` hits, so entry →
 * detail navigation cannot be built from this payload alone. See the TODO in
 * `global-search-autocomplete.tsx` (CVT-184).
 */
export const searchResultItemSchema = z.object({
  type: z.enum(['agent', 'vault', 'entry']),
  id: z.string(),
  name: z.string(),
  // Only present for `entry` hits — the vault the entry lives in.
  vaultName: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

export type SearchResultItem = z.infer<typeof searchResultItemSchema>
export type SearchResultType = SearchResultItem['type']

const searchResponseSchema = z.object({ results: z.array(searchResultItemSchema) })

/**
 * Fetches global-search autocomplete hits. The backend returns an empty list
 * for queries shorter than 2 characters; callers still gate on length to avoid
 * a needless round-trip.
 */
export async function getGlobalSearch(q: string, limit = 8): Promise<SearchResultItem[]> {
  const raw = await api.get('api/search', { searchParams: { q, limit } }).json()
  return searchResponseSchema.parse(raw).results
}
