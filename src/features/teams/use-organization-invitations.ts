import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ORG_QUERY_KEY } from '../settings/use-org'
import {
  cancelOrganizationInvitation,
  getOrganizationInvitations,
  resendOrganizationInvitation,
  updateOrganizationInvitationRole,
} from './api/organization-invitations-api'
import { useAuthStore } from '../auth'
import { parseJwtPayload } from '../../shared/lib/jwt'

export const ORGANIZATION_INVITATIONS_QUERY_KEY = ['organization-invitations'] as const

export function useOrganizationInvitations(enabled = true) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const organizationId = organizationIdFromToken(accessToken)

  return useQuery({
    queryKey: [...ORGANIZATION_INVITATIONS_QUERY_KEY, organizationId ?? 'session'],
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
        queryClient.invalidateQueries({ queryKey: ORGANIZATION_INVITATIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ORG_QUERY_KEY }),
      ])
    },
  })
}

export function useUpdateOrganizationInvitationRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateOrganizationInvitationRole,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_INVITATIONS_QUERY_KEY })
    },
  })
}

export function useResendOrganizationInvitation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resendOrganizationInvitation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORGANIZATION_INVITATIONS_QUERY_KEY })
    },
  })
}

function organizationIdFromToken(accessToken: string | null): string | null {
  if (!accessToken) return null
  const value = parseJwtPayload(accessToken)['org_id']
  return typeof value === 'string' ? value : null
}
