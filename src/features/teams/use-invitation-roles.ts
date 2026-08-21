import { useQuery } from '@tanstack/react-query'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { useAuthStore } from '../auth'
import { getOrganizationInvitationRoles } from './api/organization-invitations-api'

export const INVITATION_ROLES_QUERY_KEY = ['organization-invitation-roles'] as const

export function useInvitationRoles(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const claim = accessToken ? parseJwtPayload(accessToken)['org_id'] : null
  const organizationId = typeof claim === 'string' ? claim : null

  return useQuery({
    queryKey: [...INVITATION_ROLES_QUERY_KEY, organizationId ?? 'session'],
    queryFn: getOrganizationInvitationRoles,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}
