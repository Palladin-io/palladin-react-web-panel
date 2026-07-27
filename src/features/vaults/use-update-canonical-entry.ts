import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  buildEntryProjections,
  createEntryUpdateMaterial,
  type CanonicalEntryDetail,
  type CanonicalEntryDraft,
  type MemberSecretPlaintext,
} from '../../shared/crypto/vault-v2-entry'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { openDiscoveryKey } from '../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import {
  GRANT_STATUS_ACTIVE,
  GRANT_TYPE_FULL,
  getOrgGrants,
  type OrgGrant,
} from '../grants'
import { grantMethodsMask, parseGrantMethods } from '../grants/grant-methods'
import { updateCanonicalEntry } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import { entriesQueryKey, entryDetailQueryKey, entryHistoryQueryKey } from './use-entries'

export class ActiveGrantRefreshRequiredError extends Error {
  constructor() {
    super('Active grant envelope context is incomplete or no longer permits a payload')
    this.name = 'ActiveGrantRefreshRequiredError'
  }
}

export interface UpdateCanonicalEntryInput {
  detail: CanonicalEntryDetail
  previous: MemberSecretPlaintext
  draft: CanonicalEntryDraft
}

async function activeCoveringGrants(vaultId: string, entryId: string): Promise<OrgGrant[]> {
  const result: OrgGrant[] = []
  let cursor: string | undefined
  do {
    const page = await getOrgGrants({ vaultId, status: GRANT_STATUS_ACTIVE, cursor, pageSize: 100 })
    result.push(...page.items.filter((grant) => grant.type === GRANT_TYPE_FULL || grant.entryId === entryId))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return result
}

export function useUpdateCanonicalEntry(vaultId: string, entryId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ detail, previous, draft }: UpdateCanonicalEntryInput) => {
      const [grants, vault] = await Promise.all([
        activeCoveringGrants(vaultId, entryId),
        getEncryptedVault(vaultId),
      ])
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new Error('Vault is locked')
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
        if (grants.length > 0) {
          const nextSecret = buildEntryProjections(draft).memberSecret
          const grantEnvelopes = []
          for (const grant of grants) {
            const scope = grant.entryScopes.find((candidate) => candidate.entryId === entryId)
            const methods = parseGrantMethods(grant.methods)
            if (!scope?.grantEnvelopeRevision || !scope.grantKeyVersion || !scope.fieldIds.length
              || !grant.agentId || !grant.agentPublicKey || !grant.recipientAgentKeyVersion
              || methods.length === 0) throw new ActiveGrantRefreshRequiredError()
            try {
              grantEnvelopes.push(await produceGrantEntryEnvelope({
                memberSecret: nextSecret,
                agentPublicKey: grant.agentPublicKey,
                fieldIds: scope.fieldIds,
                narrowToPolicy: true,
                scope: {
                  organizationId: detail.organizationId,
                  vaultId,
                  grantId: grant.id,
                  agentId: grant.agentId,
                  entryId,
                  entryRevision: material.memberSecret.revision,
                  grantEnvelopeRevision: (BigInt(scope.grantEnvelopeRevision) + 1n).toString(),
                  grantKeyVersion: scope.grantKeyVersion + 1,
                  memberKeyGeneration: vault.memberKeyGeneration,
                  recipientAgentKeyVersion: grant.recipientAgentKeyVersion,
                  approvedMethods: grantMethodsMask(methods),
                  ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
                  ...(grant.queryLimit !== null && grant.queryLimit !== undefined
                    ? { remainingUses: grant.queryLimit - (grant.queryCount ?? 0) }
                    : {}),
                },
              }))
            } catch {
              throw new ActiveGrantRefreshRequiredError()
            }
          }
          material.grantEnvelopes = grantEnvelopes
        }
        return updateCanonicalEntry(vaultId, entryId, material)
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryDetailQueryKey(vaultId, entryId) })
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) })
      queryClient.invalidateQueries({ queryKey: entryHistoryQueryKey(vaultId, entryId) })
    },
  })
}
