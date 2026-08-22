import { useQuery } from '@tanstack/react-query'
import { getOrganizationRoles, ORGANIZATION_ROLES_QUERY_KEY } from '../../shared/api/organization-roles-api'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { useAuthStore } from '../auth'

export function useTeamRoles(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const claim = accessToken ? parseJwtPayload(accessToken)['org_id'] : null
  const organizationId = typeof claim === 'string' ? claim : null

  return useQuery({
    queryKey: [...ORGANIZATION_ROLES_QUERY_KEY, organizationId ?? 'session'],
    queryFn: getOrganizationRoles,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}
