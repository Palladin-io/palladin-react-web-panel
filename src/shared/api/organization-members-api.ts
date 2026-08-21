import { z } from 'zod'
import { api } from './client'
import { organizationRoleSchema } from './organization-roles-api'

/** Prefix shared by every active-organization member directory cache. */
export const ORGANIZATION_MEMBERS_QUERY_KEY = ['organization', 'members'] as const

export const organizationMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  publicKey: z.string().nullable(),
  roles: z.array(organizationRoleSchema),
  effectivePermissions: z.number().int(),
  isOwner: z.boolean(),
  joinedAt: z.string(),
  status: z.string().default('Active'),
})

const organizationMembersResponseSchema = z.object({
  items: z.array(organizationMemberSchema),
})

const updateMemberRolesResponseSchema = z.object({
  userId: z.string(),
  roles: z.array(organizationRoleSchema),
  effectivePermissions: z.number().int(),
  authorizationVersion: z.number().int().nonnegative(),
})

export type OrganizationMember = z.infer<typeof organizationMemberSchema>
export type UpdateMemberRolesResponse = z.infer<typeof updateMemberRolesResponseSchema>

export interface UpdateMemberRolesInput {
  userId: string
  roleIds: string[]
}

export async function getOrganizationMembers(): Promise<OrganizationMember[]> {
  const raw = await api.get('api/organization/members').json()
  return organizationMembersResponseSchema.parse(raw).items
}

export async function updateOrganizationMemberRoles(
  input: UpdateMemberRolesInput,
): Promise<UpdateMemberRolesResponse> {
  const raw = await api
    .put(`api/organization/members/${input.userId}/roles`, { json: { roleIds: input.roleIds } })
    .json()
  return updateMemberRolesResponseSchema.parse(raw)
}

/** Starts organization-wide staged removal. A 204 means requested, not completed. */
export async function requestOrganizationMemberRemoval(memberId: string): Promise<void> {
  await api.delete(`api/organization/members/${memberId}`)
}
