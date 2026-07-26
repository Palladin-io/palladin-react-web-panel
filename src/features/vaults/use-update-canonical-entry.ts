import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createEntryUpdateMaterial,
  type CanonicalEntryDetail,
  type CanonicalEntryDraft,
  type MemberSecretPlaintext,
} from '../../shared/crypto/vault-v2-entry'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { openDiscoveryKey } from '../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { GRANT_STATUS_ACTIVE, GRANT_TYPE_FULL, getOrgGrants } from '../grants'
import { updateCanonicalEntry } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import { entriesQueryKey, entryDetailQueryKey } from './use-entries'

export class ActiveGrantRefreshRequiredError extends Error {
  constructor() {
    super('Active grant envelopes must be refreshed with this Entry revision')
    this.name = 'ActiveGrantRefreshRequiredError'
  }
}

export interface UpdateCanonicalEntryInput {
  detail: CanonicalEntryDetail
  previous: MemberSecretPlaintext
  draft: CanonicalEntryDraft
}

async function hasActiveCoveringGrant(vaultId: string, entryId: string): Promise<boolean> {
  let cursor: string | undefined
  do {
    const page = await getOrgGrants({ vaultId, status: GRANT_STATUS_ACTIVE, cursor, pageSize: 100 })
    if (page.items.some((grant) => grant.type === GRANT_TYPE_FULL || grant.entryId === entryId)) return true
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return false
}

export function useUpdateCanonicalEntry(vaultId: string, entryId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ detail, previous, draft }: UpdateCanonicalEntryInput) => {
      if (await hasActiveCoveringGrant(vaultId, entryId)) throw new ActiveGrantRefreshRequiredError()
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new Error('Vault is locked')
      const vault = await getEncryptedVault(vaultId)
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
        organizationId: detail.organizationId,
        vaultId,
        memberId: vault.memberVaultKey.memberId,
        vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, privateKey)
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openDiscoveryKey(vault.discoveryKey, vaultKey)
        const material = await createEntryUpdateMaterial(
          detail,
          previous,
          draft,
          vaultKey,
          vault.currentKeyEpoch.vdkVersion,
          discoveryKey,
        )
        return updateCanonicalEntry(vaultId, entryId, material)
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryDetailQueryKey(vaultId, entryId) })
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) })
    },
  })
}
