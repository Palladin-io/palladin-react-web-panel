import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { getAgent } from '../agents'
import { decryptMemberSecret } from '../../shared/crypto/vault-v2-entry'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { wipe } from '../../shared/crypto/sodium'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { approveGrant, type ApproveGrantBody } from './api/pending-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { grantMethodsMask, serializeGrantMethods, type GrantMethod } from './grant-methods'
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

export interface ApproveGrantInput {
  grantId: string
  vaultId: string
  entryId: string | null | undefined
  agentId: string | null | undefined
  policy: GrantPolicyBody
  methods: GrantMethod[]
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
    }: ApproveGrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!entryId || !agentId) {
        throw new MissingGrantMaterialError()
      }

      const [vault, detail, agent] = await Promise.all([
        getEncryptedVault(vaultId),
        getCanonicalEntry(vaultId, entryId),
        getAgent(agentId),
      ])
      if (!agent.publicKey) throw new MissingGrantMaterialError()
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
        organizationId: detail.organizationId,
        vaultId,
        memberId: vault.memberVaultKey.memberId,
        vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, privateKey)
      try {
        const memberSecret = await decryptMemberSecret(detail, vaultKey)
        const envelope = await produceGrantEntryEnvelope({
          memberSecret,
          agentPublicKey: agent.publicKey,
          scope: {
            organizationId: detail.organizationId,
            vaultId,
            grantId,
            agentId,
            entryId,
            entryRevision: detail.currentRevision,
            grantEnvelopeRevision: '1',
            grantKeyVersion: 1,
            memberKeyGeneration: vault.memberKeyGeneration,
            recipientAgentKeyVersion: agent.recipientKeyVersion,
            approvedMethods: grantMethodsMask(methods),
            ...policy,
            ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
          },
        })
        const body: ApproveGrantBody = {
          grantEntry: envelope,
          ...policy,
          methods: serializeGrantMethods(methods),
        }
        await approveGrant(vaultId, grantId, body)
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY }),
  })
}
