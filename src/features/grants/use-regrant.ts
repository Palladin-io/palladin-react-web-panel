import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getEntry, getVault } from '../vaults/api/vault-api'
import { getAgent } from '../agents/api/agents-api'
import {
  createGrantProactively,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'

export interface RegrantInput {
  vaultId: string
  agentId: string
  entryId: string
  /** base64 X25519 public key from the original grant. */
  agentPublicKey: string | null | undefined
  type: GrantType
  /** XOR-or-none policy: `{expiresAt}`, `{queryLimit}`, or `{}` (lifetime). */
  policy: GrantPolicyBody
}

/**
 * "Grant again" — re-issue a fresh grant for a terminal one, producing a new
 * zero-knowledge envelope (reuses `produceGrantEntryEnvelope`) and POSTing it
 * proactively. Mirrors the approve flow's crypto orchestration: recover VK,
 * fetch the entry content, re-encrypt under a fresh DEK sealed to the agent's
 * public key, then create the grant. VK is wiped immediately after.
 */
export function useRegrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      vaultId,
      agentId,
      entryId,
      agentPublicKey,
      type,
      policy,
    }: RegrantInput) => {
      const { privateKey, userId } = useAuthStore.getState()
      if (!privateKey || !userId) throw new VaultLockedError()
      if (!agentPublicKey) throw new MissingGrantMaterialError()

      const vault = await getVault(vaultId, privateKey, userId, { vaultKey: useAuthStore.getState().cacheVaultKey, discoveryKey: useAuthStore.getState().cacheVaultDiscoveryKey })
      const vaultKey = useAuthStore.getState().getVaultKey(vault.id)
      if (!vaultKey) throw new VaultLockedError()
      try {
        const [entry, agent] = await Promise.all([getEntry(vaultId, entryId, vaultKey), getAgent(agentId)])
        if (!agent.publicKey) throw new MissingGrantMaterialError()
        const grantId = crypto.randomUUID()
        const envelope = await buildCanonicalGrantEnvelope({
          organizationId: vault.organizationId, vaultId, entryId, grantId, agentId,
          entryRevision: entry.currentRevision, memberKeyGeneration: vault.memberKeyGeneration,
          agentPublicKey: agent.publicKey, recipientKeyVersion: agent.recipientKeyVersion,
          approvedMethods: 1, expiresAt: 'expiresAt' in policy ? policy.expiresAt : undefined,
          remainingUses: 'queryLimit' in policy ? policy.queryLimit : undefined,
          secret: entry.memberSecretModel,
        })

        const body: CreateGrantBody = {
          grantId, agentId,
          type,
          entryId,
          grantEntries: [envelope],
          ...policy,
        }
        await createGrantProactively(vaultId, body)
      } finally {
        wipe(vaultKey)
      }
    },
    onSuccess: () => {
      // Grant-again resolves a matching pending request server-side, so the
      // pending queue must refresh too (alongside the org list + audit log).
      for (const queryKey of GRANT_MUTATION_INVALIDATION_KEYS) {
        queryClient.invalidateQueries({ queryKey })
      }
    },
  })
}
