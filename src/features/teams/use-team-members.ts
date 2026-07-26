import { useQuery } from '@tanstack/react-query'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { ORGANIZATION_MEMBERS_QUERY_KEY } from '../../shared/api/organization-members-api'
import { useAuthStore } from '../auth'
import { getOrganizationMembers } from './api/team-members-api'

export function useTeamMembers() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const organizationId = organizationIdFromToken(accessToken)

  return useQuery({
    queryKey: [...ORGANIZATION_MEMBERS_QUERY_KEY, organizationId ?? 'session'],
    queryFn: getOrganizationMembers,
    staleTime: 30_000,
    enabled: organizationId !== null,
  })
}

function organizationIdFromToken(accessToken: string | null): string | null {
  if (!accessToken) return null
  const value = parseJwtPayload(accessToken)['org_id']
  return typeof value === 'string' ? value : null
}
