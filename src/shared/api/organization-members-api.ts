import { api } from './client'

/** Prefix shared by every active-organization member directory cache. */
export const ORGANIZATION_MEMBERS_QUERY_KEY = ['organization', 'members'] as const

/** Starts organization-wide staged removal. A 204 means requested, not completed. */
export async function requestOrganizationMemberRemoval(memberId: string): Promise<void> {
  await api.delete(`api/organization/members/${memberId}`)
}
