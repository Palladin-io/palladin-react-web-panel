import { useQuery } from '@tanstack/react-query'
import { ORGANIZATION_MEMBERS_QUERY_KEY } from '../../shared/api/organization-members-api'
import { useAuthenticatedQueryKey, useAuthStore } from '../auth'
import { getOrganizationMembers } from './api/team-members-api'

export function useTeamMembers(enabled = true) {
  const organizationId = useAuthStore((state) => state.organizationId)
  const queryKey = useAuthenticatedQueryKey(ORGANIZATION_MEMBERS_QUERY_KEY)

  return useQuery({
    queryKey,
    queryFn: getOrganizationMembers,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}
