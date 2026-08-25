import { useQuery } from '@tanstack/react-query'
import { ORGANIZATION_MEMBERS_QUERY_KEY } from '../../shared/api/organization-members-api'
import { organizationIdFromAccessToken } from '../../shared/lib/organization-scope'
import { useAuthStore } from '../auth'
import { getOrganizationMembers } from './api/team-members-api'

export function useTeamMembers(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const organizationId = organizationIdFromAccessToken(accessToken)

  return useQuery({
    queryKey: [...ORGANIZATION_MEMBERS_QUERY_KEY, organizationId ?? 'session'],
    queryFn: getOrganizationMembers,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}
