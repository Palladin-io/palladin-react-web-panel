import { api } from '../../../shared/api/client'

export interface VaultMember {
  memberId: string
  memberName: string | null
  addedAt: string
  deprovisioningStatus: string
  rotationId: string | null
}

export interface VaultMemberPage {
  items: VaultMember[]
  nextAfterId: string | null
}

export async function getVaultMembers(
  vaultId: string,
  afterId?: string,
): Promise<VaultMemberPage> {
  const raw = await api.get(`api/vaults/${vaultId}/members`, {
    searchParams: {
      pageSize: 50,
      ...(afterId ? { afterId } : {}),
    },
  }).json<VaultMemberPage>()
  return raw
}
