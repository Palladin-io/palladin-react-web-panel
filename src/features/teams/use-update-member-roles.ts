import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import {
  ORGANIZATION_MEMBERS_QUERY_KEY,
  updateOrganizationMemberRoles,
  type UpdateMemberRolesInput,
} from '../../shared/api/organization-members-api'
import { ORGANIZATION_ROLES_QUERY_KEY } from '../../shared/api/organization-roles-api'
import { authenticatedQueryKey } from '../auth'

export function useUpdateMemberRoles() {
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
