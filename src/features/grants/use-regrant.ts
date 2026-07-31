import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import {
  createGrantProactively,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { grantMethodsMask, parseGrantMethods, serializeGrantMethods } from './grant-methods'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'

export interface RegrantInput {
  vaultId: string
  agentId: string
  entryId: string
  agentPublicKey: string | null | undefined
  recipientAgentKeyVersion: number | null | undefined
  type: GrantType
  policy: GrantPolicyBody
  methods: string | null | undefined
}

export function useRegrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      vaultId,
      agentId,
      entryId,
      agentPublicKey,
      recipientAgentKeyVersion,
      type,
      policy,
      methods: serializedMethods,
    }: RegrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      const methods = parseGrantMethods(serializedMethods)
      if (!privateKey) throw new VaultLockedError()
      if (!agentPublicKey || !recipientAgentKeyVersion || methods.length === 0) {
        throw new MissingGrantMaterialError()
      }

      const [vault, detail] = await Promise.all([
        getEncryptedVault(vaultId),
        getCanonicalEntry(vaultId, entryId),
      ])
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      const grantId = crypto.randomUUID()
      try {
        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
        })
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey,
          organizationId: detail.organizationId, vaultId, grantId, agentId, entryId,
          entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
          memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: recipientAgentKeyVersion,
          approvedMethods: grantMethodsMask(methods), approvedFieldIds: listGrantableFieldIds(memberSecret),
          ...policy, ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
        })
        const body: CreateGrantBody = {
          grantId,
          agentId,
          type,
          entryId,
          grantEntries: [envelope],
          ...policy,
          methods: serializeGrantMethods(methods),
        }
        await createGrantProactively(vaultId, body)
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: () => {
      for (const queryKey of GRANT_MUTATION_INVALIDATION_KEYS) {
        queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}
