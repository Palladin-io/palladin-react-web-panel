import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { getAgent } from '../agents'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { approveGrant, type ApproveGrantBody } from './api/pending-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import {
  grantMethodsFromMask,
  grantMethodsMask,
  serializeGrantMethods,
  type GrantMethod,
} from './grant-methods'
import { GRANTS_QUERY_KEY } from './query-keys'

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked or its key is unavailable')
    this.name = 'VaultLockedError'
  }
}

export class MissingGrantMaterialError extends Error {
  constructor() {
    super('Cannot produce a revision-bound grant envelope')
    this.name = 'MissingGrantMaterialError'
  }
}

export class StaleGrantReviewError extends Error {
  constructor() {
    super('Entry changed after the approval review')
    this.name = 'StaleGrantReviewError'
  }
}

export interface ApproveGrantInput {
  grantId: string
  vaultId: string
  entryId: string | null | undefined
  agentId: string | null | undefined
  policy: GrantPolicyBody
  methods: GrantMethod[]
  fieldIds: string[]
  reviewedEntryRevision: string
  requestedMethods: number
}

export function useApproveGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      grantId,
      vaultId,
      entryId,
      agentId,
      policy,
      methods,
      fieldIds,
      reviewedEntryRevision,
      requestedMethods,
    }: ApproveGrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!entryId || !agentId) {
        throw new MissingGrantMaterialError()
      }
      const approvedMethods = grantMethodsMask(methods)
      if (approvedMethods === 0 || (approvedMethods & requestedMethods) !== approvedMethods) {
        throw new MissingGrantMaterialError()
      }

      const [vault, detail, agent] = await Promise.all([
        getEncryptedVault(vaultId),
        getCanonicalEntry(vaultId, entryId),
        getAgent(agentId),
      ])
      if (!agent.publicKey) throw new MissingGrantMaterialError()
      if (detail.currentRevision !== reviewedEntryRevision || (detail.state !== 'active' && detail.state !== 1)) {
        throw new StaleGrantReviewError()
      }
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      try {
        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
        })
        const approvedFieldIds = listGrantableFieldIds(memberSecret)
        const reviewedFieldIds = [...fieldIds].sort()
        const reviewedFieldSet = new Set(reviewedFieldIds)
        const currentFieldIds = [...approvedFieldIds].sort()
        if (reviewedFieldIds.length === 0
          || reviewedFieldSet.size !== reviewedFieldIds.length
          || reviewedFieldIds.length !== currentFieldIds.length
          || reviewedFieldIds.some((fieldId, index) => fieldId !== currentFieldIds[index])) {
          throw new MissingGrantMaterialError()
        }
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey: agent.publicKey,
          organizationId: detail.organizationId, vaultId, grantId, agentId, entryId,
          entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
          memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: agent.recipientKeyVersion,
          approvedMethods, approvedFieldIds: currentFieldIds,
          ...policy, ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
        })
        const body: ApproveGrantBody = {
          grantEntry: envelope,
          ...policy,
          methods: serializeGrantMethods(grantMethodsFromMask(approvedMethods)),
        }
        if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
        const latest = await getCanonicalEntry(vaultId, entryId)
        if (latest.currentRevision !== reviewedEntryRevision || (latest.state !== 'active' && latest.state !== 1)) {
          throw new StaleGrantReviewError()
        }
        await approveGrant(vaultId, grantId, body)
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY }),
  })
}
