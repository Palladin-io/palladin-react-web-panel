import { useQuery } from '@tanstack/react-query'
import { getOrganization } from './api/org-api'

export const ORG_QUERY_KEY = ['organization'] as const

export function useOrg() {
  return useQuery({
    queryKey: ORG_QUERY_KEY,
    queryFn: getOrganization,
    staleTime: 5 * 60 * 1000,
  })
}
