import { z } from 'zod'
import { api } from '../../../shared/api/client'

/**
 * Organization resource returned by `GET /api/org`. `planType` mirrors
 * the backend billing tier; `memberCount` is a denormalised count kept
 * for the settings header summary.
 */
export const organizationSchema = z.object({
  orgId: z.string(),
  name: z.string(),
  planType: z.string(),
  memberCount: z.number(),
})

export type Organization = z.infer<typeof organizationSchema>

export interface UpdateOrgInput {
  name: string
}

export async function getOrganization(): Promise<Organization> {
  const data = await api.get('api/org').json()
  return organizationSchema.parse(data)
}

/**
 * Renames the organization. Backend returns 204 No Content on success,
 * so this resolves to void. Requires the OrganizationManagement
 * permission — a 403 surfaces as a generic save error to the user.
 */
export async function updateOrganization(input: UpdateOrgInput): Promise<void> {
  await api.put('api/org', { json: input })
}
