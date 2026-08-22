import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey, useAuthStore } from '../auth'
import { getOrganizationInvitationRoles } from './api/organization-invitations-api'

export const INVITATION_ROLES_QUERY_KEY = ['organization-invitation-roles'] as const

export function useInvitationRoles(enabled = true) {
  const organizationId = useAuthStore((state) => state.organizationId)
  const queryKey = useAuthenticatedQueryKey(INVITATION_ROLES_QUERY_KEY)

  return useQuery({
    queryKey,
    queryFn: getOrganizationInvitationRoles,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}
