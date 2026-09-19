import { api } from './client'

export const ORGANIZATION_MEMBER_DIRECTORY_QUERY_KEY = [
  'organization',
  'member-directory',
] as const

export interface OrganizationMemberDirectoryItem {
  userId: string
  displayName: string
}

export async function getOrganizationMemberDirectory(): Promise<
  OrganizationMemberDirectoryItem[]
> {
  const raw = await api.get('api/organization/member-directory').json<{ items: OrganizationMemberDirectoryItem[] }>()
  return raw.items.map(({ userId, displayName }) => ({ userId, displayName }))
}
