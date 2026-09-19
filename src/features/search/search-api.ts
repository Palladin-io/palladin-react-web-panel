import { api } from '../../shared/api/client'

export interface RemoteSearchResult {
  type: 'agent' | 'member'
  id: string
  name: string
}

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
  }).json<{ results: RemoteSearchResult[] }>()
  return raw.results
}
