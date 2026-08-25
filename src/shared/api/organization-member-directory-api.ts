import { z } from 'zod'
import { api } from './client'

export const ORGANIZATION_MEMBER_DIRECTORY_QUERY_KEY = [
  'organization',
  'member-directory',
] as const

export const organizationMemberDirectoryItemSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
}).strict()

const organizationMemberDirectoryResponseSchema = z.object({
  items: z.array(organizationMemberDirectoryItemSchema),
}).strict()

export type OrganizationMemberDirectoryItem = z.infer<
  typeof organizationMemberDirectoryItemSchema
>

export async function getOrganizationMemberDirectory(): Promise<
  OrganizationMemberDirectoryItem[]
> {
  const raw = await api.get('api/organization/member-directory').json()
  return organizationMemberDirectoryResponseSchema.parse(raw).items
}
