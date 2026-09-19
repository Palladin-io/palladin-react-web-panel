import { api } from './client'

export const ORGANIZATION_ROLES_QUERY_KEY = ['organization-roles'] as const

export interface OrganizationRole {
  id: string
  name: string
  permissions: number
  isSystem: boolean
  canAssign: boolean
  assignedMemberCount: number
}

export interface AssignablePermission {
  key: string
  value: number
  canAssign: boolean
}

export interface OrganizationRolesResponse {
  items: OrganizationRole[]
  assignablePermissions: AssignablePermission[]
}

export interface SaveOrganizationRoleInput {
  name: string
  permissions: number
}

export async function getOrganizationRoles(): Promise<OrganizationRolesResponse> {
  const raw = await api.get('api/organization/roles').json<OrganizationRolesResponse>()
  return raw
}

export async function createOrganizationRole(input: SaveOrganizationRoleInput): Promise<OrganizationRole> {
  const raw = await api.post('api/organization/roles', { json: input }).json<OrganizationRole>()
  return raw
}

export async function updateOrganizationRole(
  roleId: string,
  input: SaveOrganizationRoleInput,
): Promise<OrganizationRole> {
  const raw = await api.put(`api/organization/roles/${roleId}`, { json: input }).json<OrganizationRole>()
  return raw
}

export async function deleteOrganizationRole(roleId: string): Promise<void> {
  await api.delete(`api/organization/roles/${roleId}`)
}
