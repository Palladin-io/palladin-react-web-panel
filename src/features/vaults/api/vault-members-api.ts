import { z } from 'zod'
import { api } from '../../../shared/api/client'

export const vaultMemberStatusSchema = z.enum([
  'Active',
  'Pending',
  'WaitingForRotation',
  'BlockedLastMember',
])

export const vaultMemberSchema = z.object({
  memberId: z.string().uuid(),
  memberName: z.string().nullable(),
  addedAt: z.string(),
  deprovisioningStatus: vaultMemberStatusSchema,
  rotationId: z.string().uuid().nullable(),
}).strict()

const vaultMemberPageSchema = z.object({
  items: z.array(vaultMemberSchema).max(100),
  nextAfterId: z.string().uuid().nullable(),
}).strict()

export type VaultMember = z.infer<typeof vaultMemberSchema>
export type VaultMemberPage = z.infer<typeof vaultMemberPageSchema>

export async function getVaultMembers(
  vaultId: string,
  afterId?: string,
): Promise<VaultMemberPage> {
  const raw = await api.get(`api/vaults/${vaultId}/members`, {
    searchParams: {
      pageSize: 50,
      ...(afterId ? { afterId } : {}),
    },
  }).json()
  return vaultMemberPageSchema.parse(raw)
}

/** Starts organization-wide staged removal. A 204 means requested, not completed. */
export async function requestOrganizationMemberRemoval(memberId: string): Promise<void> {
  await api.delete(`api/organization/members/${memberId}`)
}
