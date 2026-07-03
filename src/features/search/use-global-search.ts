import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getGlobalSearch } from './search-api'

/**
 * Global-search autocomplete query. Only runs once the trimmed query reaches
 * the backend's 2-character minimum; keeps the previous page of results while
 * the next query settles so the dropdown does not flash empty on each keystroke.
 */
export function useGlobalSearch(query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['search', trimmed],
    queryFn: () => getGlobalSearch(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  })
}
