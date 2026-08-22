import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import {
  getOrganizationMembers,
  ORGANIZATION_MEMBERS_QUERY_KEY,
  updateOrganizationMemberRoles,
  type UpdateMemberRolesInput,
} from '../../shared/api/organization-members-api'
import { ORGANIZATION_ROLES_QUERY_KEY } from '../../shared/api/organization-roles-api'
import {
  authenticatedQueryKey,
  useAuthenticatedQueryKey,
  useAuthStore,
} from '../auth'

export function useRoleMembers(enabled = true) {
  const organizationId = useAuthStore((state) => state.organizationId)
  const queryKey = useAuthenticatedQueryKey(ORGANIZATION_MEMBERS_QUERY_KEY)

  return useQuery({
    queryKey,
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
      void queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(ORGANIZATION_MEMBERS_QUERY_KEY),
      })
      void queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(ORGANIZATION_ROLES_QUERY_KEY),
      })
    },
  })
}
