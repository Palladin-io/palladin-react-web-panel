import { api } from '../../../shared/api/client'

export interface Organization {
  orgId: string
  name: string
  memberCount: number
  seatUsage: number
  seatLimit: number
}

export interface UpdateOrgInput {
  name: string
}

export async function getOrganization(): Promise<Organization> {
  const data = await api.get('api/org').json<Organization>()
  return data
}

/**
 * Renames the organization. Backend returns 204 No Content on success,
 * so this resolves to void. Requires the OrganizationManagement
 * permission — a 403 surfaces as a generic save error to the user.
 */
export async function updateOrganization(input: UpdateOrgInput): Promise<void> {
  await api.put('api/org', { json: input })
}
