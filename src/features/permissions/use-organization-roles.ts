import { useQuery } from '@tanstack/react-query'
import { getOrganizationRoles, ORGANIZATION_ROLES_QUERY_KEY } from '../../shared/api/organization-roles-api'
import { useAuthenticatedQueryKey, useAuthStore } from '../auth'

export function useOrganizationRoles() {
  const organizationId = useAuthStore((state) => state.organizationId)
  const queryKey = useAuthenticatedQueryKey(ORGANIZATION_ROLES_QUERY_KEY)
  return useQuery({
    queryKey,
    queryFn: getOrganizationRoles,
    staleTime: 30_000,
    enabled: organizationId !== null,
  })
}
