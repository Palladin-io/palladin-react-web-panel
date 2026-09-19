import { api } from './client'
import type { OrganizationRole } from './organization-roles-api'

/** Prefix shared by every active-organization member directory cache. */
export const ORGANIZATION_MEMBERS_QUERY_KEY = ['organization', 'members'] as const

export interface OrganizationMember {
  userId: string
  displayName: string
  email: string
  publicKey: string | null
  roles: OrganizationRole[]
  effectivePermissions: number
  isOwner: boolean
  joinedAt: string
  status: string
}

export interface UpdateMemberRolesResponse {
  userId: string
  roles: OrganizationRole[]
  effectivePermissions: number
  authorizationVersion: number
}

export interface UpdateMemberRolesInput {
  userId: string
  roleIds: string[]
}

export async function getOrganizationMembers(): Promise<OrganizationMember[]> {
  const raw = await api.get('api/organization/members').json<{ items: OrganizationMember[] }>()
  return raw.items
}

export async function updateOrganizationMemberRoles(
  input: UpdateMemberRolesInput,
): Promise<UpdateMemberRolesResponse> {
  const raw = await api
    .put(`api/organization/members/${input.userId}/roles`, { json: { roleIds: input.roleIds } })
    .json<UpdateMemberRolesResponse>()
  return raw
}

/** Starts organization-wide staged removal. A 204 means requested, not completed. */
export async function requestOrganizationMemberRemoval(memberId: string): Promise<void> {
  await api.delete(`api/organization/members/${memberId}`)
}
