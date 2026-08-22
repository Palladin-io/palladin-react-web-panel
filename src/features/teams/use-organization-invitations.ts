import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { ORG_QUERY_KEY } from '../settings/use-org'
import {
  cancelOrganizationInvitation,
  getOrganizationInvitations,
  resendOrganizationInvitation,
  updateOrganizationInvitationRole,
} from './api/organization-invitations-api'
import {
  authenticatedQueryKey,
  useAuthenticatedQueryKey,
  useAuthStore,
} from '../auth'

export const ORGANIZATION_INVITATIONS_QUERY_KEY = ['organization-invitations'] as const

export function useOrganizationInvitations(enabled = true) {
  const organizationId = useAuthStore((state) => state.organizationId)
  const queryKey = useAuthenticatedQueryKey(ORGANIZATION_INVITATIONS_QUERY_KEY)

  return useQuery({
    queryKey,
    queryFn: getOrganizationInvitations,
    staleTime: 30_000,
    enabled: enabled && organizationId !== null,
  })
}

export function useCancelOrganizationInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cancelOrganizationInvitation,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: authenticatedQueryKey(ORGANIZATION_INVITATIONS_QUERY_KEY),
        }),
        queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(ORG_QUERY_KEY) }),
      ])
    },
  })
}

export function useUpdateOrganizationInvitationRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateOrganizationInvitationRole,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(ORGANIZATION_INVITATIONS_QUERY_KEY),
      })
    },
  })
}

export function useResendOrganizationInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resendOrganizationInvitation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(ORGANIZATION_INVITATIONS_QUERY_KEY),
      })
    },
  })
}
