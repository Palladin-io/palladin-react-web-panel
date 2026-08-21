import { z } from 'zod'
import { api } from './client'

export const ORGANIZATION_ROLES_QUERY_KEY = ['organization-roles'] as const

export const organizationRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.number().int(),
  isSystem: z.boolean(),
  canAssign: z.boolean(),
  assignedMemberCount: z.number().int().nonnegative().default(0),
})

export const assignablePermissionSchema = z.object({
  key: z.string(),
  value: z.number().int().positive(),
  canAssign: z.boolean(),
})

const organizationRolesResponseSchema = z.object({
  items: z.array(organizationRoleSchema),
  assignablePermissions: z.array(assignablePermissionSchema),
})

export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type AssignablePermission = z.infer<typeof assignablePermissionSchema>

export interface OrganizationRolesResponse {
  items: OrganizationRole[]
  assignablePermissions: AssignablePermission[]
}

export interface SaveOrganizationRoleInput {
  name: string
  permissions: number
}

export async function getOrganizationRoles(): Promise<OrganizationRolesResponse> {
  const raw = await api.get('api/organization/roles').json()
  return organizationRolesResponseSchema.parse(raw)
}

export async function createOrganizationRole(input: SaveOrganizationRoleInput): Promise<OrganizationRole> {
  const raw = await api.post('api/organization/roles', { json: input }).json()
  return organizationRoleSchema.parse(raw)
}

export async function updateOrganizationRole(
  roleId: string,
  input: SaveOrganizationRoleInput,
): Promise<OrganizationRole> {
  const raw = await api.put(`api/organization/roles/${roleId}`, { json: input }).json()
  return organizationRoleSchema.parse(raw)
}

export async function deleteOrganizationRole(roleId: string): Promise<void> {
  await api.delete(`api/organization/roles/${roleId}`)
}
