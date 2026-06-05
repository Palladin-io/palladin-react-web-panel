import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { wipe } from '../../shared/crypto/sodium'
import { getEntries, getEntry, getVault } from '../vaults/api/vault-api'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_GRANULAR,
  createGrantProactively,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'

export interface CreateGrantInput {
  vaultId: string
  agentId: string
  /** base64 X25519 public key of the agent — required to seal the DEK(s). */
  agentPublicKey: string | null | undefined
  type: GrantType
  /** Required for GRANULAR; ignored for FULL (which covers every vault entry). */
  entryId?: string
  /** XOR-or-none policy: `{expiresAt}`, `{queryLimit}`, or `{}` (lifetime). */
  policy: GrantPolicyBody
}

/**
 * Proactively grant an agent access — the single mutation behind all grant
 * entry points (vault→agent FULL, entry→agent GRANULAR, agent→target either).
 *
 * Crypto orchestration (delegated to `shared/crypto/`): recover the Vault Key
 * once, produce a fresh per-entry envelope sealed to the agent's public key,
 * then POST proactively.
 *
 * - GRANULAR: one envelope for `entryId`; body carries `entryId`.
 * - FULL: fetch every entry of the vault, produce one envelope per entry, body
 *   omits `entryId` and carries the full `grantEntries` array.
 *   NOTE: a FULL grant only covers the entries that exist NOW — entries added
 *   later need a re-wrap. TODO(CVT-140): auto re-wrap on entry creation.
 *
 * The VK is wiped in `finally` regardless of outcome. The backend enforces
 * `MaxGrantEntriesPerGrant`; an over-limit FULL grant surfaces as a backend
 * error (caught by the caller's `onError`).
 */
export function useCreateGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      vaultId,
      agentId,
      agentPublicKey,
      type,
      entryId,
      policy,
    }: CreateGrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!agentPublicKey) throw new MissingGrantMaterialError()
      if (type === GRANT_TYPE_GRANULAR && !entryId) {
        throw new MissingGrantMaterialError()
      }

      const vault = await getVault(vaultId)
      if (!vault.wrappedVK) throw new VaultLockedError()

      const vaultKey = await unsealVaultKey(vault.wrappedVK, privateKey)
      try {
        let body: CreateGrantBody

        if (type === GRANT_TYPE_FULL) {
          // Cover every entry currently in the vault.
          const { items } = await getEntries(vaultId)
          const grantEntries = []
          for (const item of items) {
            const detail = await getEntry(vaultId, item.id)
            const envelope = await produceGrantEntryEnvelope({
              entryContent: detail.content,
              vaultKey,
              agentPublicKey,
            })
            grantEntries.push({ entryId: item.id, ...envelope })
          }
          body = { agentId, type: GRANT_TYPE_FULL, grantEntries, ...policy }
        } else {
          const detail = await getEntry(vaultId, entryId!)
          const envelope = await produceGrantEntryEnvelope({
            entryContent: detail.content,
            vaultKey,
            agentPublicKey,
          })
          body = {
            agentId,
            type: GRANT_TYPE_GRANULAR,
            entryId,
            grantEntries: [{ entryId: entryId!, ...envelope }],
            ...policy,
          }
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
