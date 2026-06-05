import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { wipe } from '../../shared/crypto/sodium'
import { getEntry, getVault } from '../vaults/api/vault-api'
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
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!agentPublicKey) throw new MissingGrantMaterialError()

      const [vault, entry] = await Promise.all([
        getVault(vaultId),
        getEntry(vaultId, entryId),
      ])
      if (!vault.wrappedVK) throw new VaultLockedError()

      const vaultKey = await unsealVaultKey(vault.wrappedVK, privateKey)
      try {
        const envelope = await produceGrantEntryEnvelope({
          entryContent: entry.content,
          vaultKey,
          agentPublicKey,
        })

        const body: CreateGrantBody = {
          agentId,
          type,
          entryId,
          grantEntries: [{ entryId, ...envelope }],
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
