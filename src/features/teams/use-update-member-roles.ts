import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ORGANIZATION_MEMBERS_QUERY_KEY,
  updateOrganizationMemberRoles,
  type UpdateMemberRolesInput,
} from '../../shared/api/organization-members-api'
import { ORGANIZATION_ROLES_QUERY_KEY } from '../../shared/api/organization-roles-api'

export function useUpdateMemberRoles() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateMemberRolesInput) => updateOrganizationMemberRoles(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ORGANIZATION_MEMBERS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: ORGANIZATION_ROLES_QUERY_KEY })
    },
  })
}
