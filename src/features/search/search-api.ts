import { z } from 'zod'
import { api } from '../../shared/api/client'

const remoteSearchResultSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent'), id: z.string().uuid(), name: z.string().max(256) }).strict(),
  z.object({ type: z.literal('member'), id: z.string().uuid(), name: z.string().max(256) }).strict(),
])

const searchResponseSchema = z.object({
  results: z.array(remoteSearchResultSchema).max(25),
}).strict()

export type RemoteSearchResult = z.infer<typeof remoteSearchResultSchema>

/** Ephemeral administrative search. The query is sent in the request body and
 * is never placed in a URL or TanStack Query cache key. */
export async function getAdministrativeSearch(
  query: string,
  signal: AbortSignal,
  limit = 8,
): Promise<RemoteSearchResult[]> {
  const raw = await api.post('api/search', {
    json: { q: query, limit },
    signal,
  }).json()
  return searchResponseSchema.parse(raw).results
}
