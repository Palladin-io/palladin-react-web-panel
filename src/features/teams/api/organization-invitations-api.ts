import { z } from 'zod'
import { api } from '../../../shared/api/client'
import type { AuthResponse } from '../../../shared/api/types'

const invitationRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const invitationRolesResponseSchema = z.object({
  items: z.array(invitationRoleSchema),
})

export const organizationInvitationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  roleId: z.string(),
  roleName: z.string(),
  invitedByName: z.string().nullable(),
  createdAt: z.string(),
  sentAt: z.string(),
  expiresAt: z.string(),
  resendAvailableAt: z.string(),
})

export const resendOrganizationInvitationResponseSchema = z.object({
  sentAt: z.string(),
  expiresAt: z.string(),
  resendAvailableAt: z.string(),
})

const organizationInvitationsResponseSchema = z.object({
  items: z.array(organizationInvitationSchema),
})

export type InvitationRole = z.infer<typeof invitationRoleSchema>
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>
export type ResendOrganizationInvitationResponse = z.infer<
  typeof resendOrganizationInvitationResponseSchema
>

export async function getOrganizationInvitationRoles(): Promise<InvitationRole[]> {
  const raw = await api.get('api/organization/invitation-roles').json()
  return invitationRolesResponseSchema.parse(raw).items
}

export async function inviteOrganizationMember(input: {
  email: string
  roleId: string
}): Promise<void> {
  await api.post('api/organization/invitations', { json: input })
}

export async function acceptOrganizationInvitation(token: string): Promise<AuthResponse> {
  return api.post('api/organization/invitations/accept', {
    json: { token },
  }).json<AuthResponse>()
}

export async function getOrganizationInvitations(): Promise<OrganizationInvitation[]> {
  const raw = await api.get('api/organization/invitations').json()
  return organizationInvitationsResponseSchema.parse(raw).items
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
  }).json()
  return resendOrganizationInvitationResponseSchema.parse(raw)
}
