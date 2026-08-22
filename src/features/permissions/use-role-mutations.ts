import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { ORGANIZATION_MEMBERS_QUERY_KEY } from '../../shared/api/organization-members-api'
import {
  createOrganizationRole,
  deleteOrganizationRole,
  ORGANIZATION_ROLES_QUERY_KEY,
  updateOrganizationRole,
  type SaveOrganizationRoleInput,
} from '../../shared/api/organization-roles-api'
import { authenticatedQueryKey } from '../auth'

function useInvalidateRoles() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({
      queryKey: authenticatedQueryKey(ORGANIZATION_ROLES_QUERY_KEY),
    })
    void queryClient.invalidateQueries({
      queryKey: authenticatedQueryKey(ORGANIZATION_MEMBERS_QUERY_KEY),
    })
  }
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles()
  return useMutation({ mutationFn: createOrganizationRole, onSuccess: invalidate })
}

export function useUpdateRole() {
  const invalidate = useInvalidateRoles()
  return useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: SaveOrganizationRoleInput }) =>
      updateOrganizationRole(roleId, input),
    onSuccess: invalidate,
  })
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles()
  return useMutation({ mutationFn: deleteOrganizationRole, onSuccess: invalidate })
}
