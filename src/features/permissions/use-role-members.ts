import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getOrganizationMembers,
  ORGANIZATION_MEMBERS_QUERY_KEY,
  updateOrganizationMemberRoles,
  type UpdateMemberRolesInput,
} from '../../shared/api/organization-members-api'
import { ORGANIZATION_ROLES_QUERY_KEY } from '../../shared/api/organization-roles-api'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { useAuthStore } from '../auth'

export function useRoleMembers(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const organizationId = getOrganizationId(accessToken)

  return useQuery({
    queryKey: [...ORGANIZATION_MEMBERS_QUERY_KEY, organizationId ?? 'session'],
    queryFn: getOrganizationMembers,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}

export function useRemoveRoleFromMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMemberRolesInput) => updateOrganizationMemberRoles(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORGANIZATION_MEMBERS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ORGANIZATION_ROLES_QUERY_KEY })
    },
  })
}

function getOrganizationId(accessToken: string | null): string | null {
  if (!accessToken) return null
  const claim = parseJwtPayload(accessToken)['org_id']
  return typeof claim === 'string' ? claim : null
}
