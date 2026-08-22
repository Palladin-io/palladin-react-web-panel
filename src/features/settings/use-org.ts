import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey, useAuthStore } from '../auth'
import { getOrganization } from './api/org-api'

export const ORG_QUERY_KEY = ['organization'] as const

export function useOrg() {
  const organizationId = useAuthStore((state) => state.organizationId)
  const queryKey = useAuthenticatedQueryKey(ORG_QUERY_KEY)

  return useQuery({
    queryKey,
    queryFn: getOrganization,
    staleTime: 5 * 60 * 1000,
    enabled: organizationId !== null,
  })
}
