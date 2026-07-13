import { z } from 'zod'
import { api } from '../../../shared/api/client'

export const organizationRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.number().int(),
  isSystem: z.boolean(),
})

export const organizationMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  email: z.string(),
  publicKey: z.string().nullable(),
  roles: z.array(organizationRoleSchema),
  effectivePermissions: z.number().int(),
  isOwner: z.boolean(),
  joinedAt: z.string(),
})

const organizationMembersResponseSchema = z.object({
  items: z.array(organizationMemberSchema),
})

export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type OrganizationMember = z.infer<typeof organizationMemberSchema>

export async function getOrganizationMembers(): Promise<OrganizationMember[]> {
  const raw = await api.get('api/organization/members').json()
  return organizationMembersResponseSchema.parse(raw).items
}
