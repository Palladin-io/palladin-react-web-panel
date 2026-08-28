import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { getAgent } from '../agents'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import {
  NOTIFICATIONS_CACHE_ROOT_KEY,
  resolvePendingGrantNotification,
} from '../../shared/lib/pending-grant-notification-reconciliation'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { buildCompleteScriptExecutionPackage } from '../vaults/script-execution-package'
import { GRANT_TYPE_SCRIPT_EXECUTION, type GrantType } from './api/org-grants-api'
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
  type: GrantType
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
      type,
      policy,
      methods,
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
        if (type === GRANT_TYPE_SCRIPT_EXECUTION) {
          if (methods.length !== 1 || methods[0] !== 'exec'
            || approvedMethods !== 2 || !agent.recipientKeyVersion || !agent.accessEpoch) {
            throw new MissingGrantMaterialError()
          }
          const scriptPackage = await buildCompleteScriptExecutionPackage({
            organizationId: vault.organizationId,
            vaultId,
            scriptEntryId: entryId,
            agentId,
            agentAccessEpoch: agent.accessEpoch,
            grantId,
            packageRevision: '1',
            recipientAgentKeyVersion: agent.recipientKeyVersion,
            agentPublicKey: agent.publicKey,
            vaultKey,
          })
          if (scriptPackage.scriptRevision !== reviewedEntryRevision) {
            throw new StaleGrantReviewError()
          }
          const body: ApproveGrantBody = {
            scriptPackage,
            ...policy,
            methods: serializeGrantMethods(['exec']),
          }
          if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
          const latest = await getCanonicalEntry(vaultId, entryId)
          if (latest.currentRevision !== reviewedEntryRevision || (latest.state !== 'active' && latest.state !== 1)) {
            throw new StaleGrantReviewError()
          }
          await approveGrant(vaultId, grantId, body)
          return
        }

        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
        })
        const approvedFieldIds = listGrantableFieldIds(memberSecret)
        if (approvedFieldIds.length === 0) throw new MissingGrantMaterialError()
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey: agent.publicKey,
          organizationId: detail.organizationId, vaultId, grantId, agentId, entryId,
          entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
          memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: agent.recipientKeyVersion,
          approvedMethods, approvedFieldIds,
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
    onSuccess: (_data, input) => {
      resolvePendingGrantNotification(queryClient, input.grantId)
      void queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATIONS_CACHE_ROOT_KEY,
        refetchType: 'none',
      })
    },
  })
}
