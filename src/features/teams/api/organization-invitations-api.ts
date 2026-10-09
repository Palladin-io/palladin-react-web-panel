import { browserSessionPost } from '../../../shared/api/browser-session-transport'
import { useAuthStore } from '../../auth/stores/auth-store'
import { api } from '../../../shared/api/client'
import type { AuthResponse } from '../../../shared/api/types'

export interface InvitationRole {
  id: string
  name: string
}

export interface OrganizationInvitation {
  id: string
  email: string
  roleId: string
  roleName: string
  invitedByName: string | null
  createdAt: string
  sentAt: string
  expiresAt: string
  resendAvailableAt: string
}

export interface ResendOrganizationInvitationResponse {
  sentAt: string
  expiresAt: string
  resendAvailableAt: string
}

export async function getOrganizationInvitationRoles(): Promise<InvitationRole[]> {
  const raw = await api.get('api/organization/invitation-roles').json<{ items: InvitationRole[] }>()
  return raw.items
}

export async function inviteOrganizationMember(input: {
  email: string
  roleId: string
}): Promise<void> {
  await api.post('api/organization/invitations', { json: input })
}

export async function acceptOrganizationInvitation(token: string): Promise<AuthResponse> {
  return browserSessionPost('organization/invitations/accept', {
    headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
    json: { token },
  })
}

export async function getOrganizationInvitations(): Promise<OrganizationInvitation[]> {
  const raw = await api.get('api/organization/invitations').json<{ items: OrganizationInvitation[] }>()
  return raw.items
}

export async function cancelOrganizationInvitation(invitationId: string): Promise<void> {
  await api.delete(`api/organization/invitations/${invitationId}`)
}

export async function updateOrganizationInvitationRole(input: {
  invitationId: string
  roleId: string
}): Promise<void> {
  await api.put(`api/organization/invitations/${input.invitationId}/role`, {
    json: { roleId: input.roleId },
  })
}

export async function resendOrganizationInvitation(
  invitationId: string,
): Promise<ResendOrganizationInvitationResponse> {
  const raw = await api.post(`api/organization/invitations/${invitationId}/resend`, {
    json: {},
  }).json<ResendOrganizationInvitationResponse>()
  return raw
}
