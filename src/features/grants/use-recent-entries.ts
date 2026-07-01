import { useQuery } from '@tanstack/react-query'
import { searchEntries } from './api/entry-search-api'
import { RECENT_ENTRIES_QUERY_KEY } from './query-keys'

/**
 * Most recently added/modified entries across the organization (metadata only)
 * for the dashboard "Recently added / modified" widget. Orders by `updatedAt`
 * descending server-side. `enabled` gates the fetch on the GrantManage
 * permission — the `/api/entries` endpoint requires it, so users without it
 * never trigger a 403 and the widget simply stays hidden.
 */
export function useRecentEntries(limit = 8, enabled = true) {
  return useQuery({
    queryKey: [...RECENT_ENTRIES_QUERY_KEY, limit],
    queryFn: () => searchEntries('', limit, 'recent'),
    staleTime: 30_000,
    enabled,
  })
}
