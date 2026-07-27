import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getEntry, getVault } from '../vaults/api/vault-api'
import { getAgent } from '../agents/api/agents-api'
import { approveGrant, type ApproveGrantBody } from './api/pending-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { grantMethodsBits, serializeGrantMethods, type GrantMethod } from './grant-methods'
import { GRANTS_QUERY_KEY } from './query-keys'

/** Thrown when the in-memory vault key cannot be recovered. */
export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked or its key is unavailable')
    this.name = 'VaultLockedError'
  }
}

/**
 * Thrown when the data required to build the approval envelope is missing —
 * notably the agent's public key, which the pending-grants endpoint does not
 * yet return. Surfaced as a user-facing error rather than sending a bad payload.
 */
export class MissingGrantMaterialError extends Error {
  constructor() {
    super('Cannot approve: required grant material is missing')
    this.name = 'MissingGrantMaterialError'
  }
}

export interface ApproveGrantInput {
  grantId: string
  agentId: string | null | undefined
  vaultId: string
  entryId: string | null | undefined
  /** base64 X25519 public key from the pending grant (required to seal the DEK). */
  agentPublicKey: string | null | undefined
  /**
   * Access policy: `{ expiresAt }` (time-limited), `{ queryLimit }` (use-capped),
   * or `{}` (lifetime — neither field). Never both.
   */
  policy: GrantPolicyBody
  /** Methods the agent may use (CVT-149) — at least one. */
  methods: GrantMethod[]
}

/**
 * Approves a GRANULAR pending grant by producing a zero-knowledge envelope and
 * PUTting it to the approve endpoint.
 *
 * Crypto orchestration (delegated entirely to `shared/crypto/`):
 *   1. Read VK from the unlocked in-memory key store.
 *   2. Fetch the entry's sealed content.
 *   3. `produceGrantEntryEnvelope` → re-encrypt under a fresh DEK + seal DEK to
 *      the agent's public key.
 *   4. PUT approve with the envelope + XOR policy.
 *
 * The VK is wiped immediately after the envelope is produced. The private key
 * stays owned by the auth store (never wiped here). No key/plaintext is logged.
 */
export function useApproveGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      grantId,
      agentId,
      vaultId,
      entryId,
      agentPublicKey,
      policy,
      methods,
    }: ApproveGrantInput) => {
      const { privateKey, userId } = useAuthStore.getState()
      if (!privateKey || !userId) throw new VaultLockedError()

      // The agent public key + target entry are required to build the envelope.
      // The pending-grants endpoint does not yet return `agentPublicKey`, so we
      // fail loudly here instead of sending an envelope sealed to nothing.
      if (!agentPublicKey || !entryId || !agentId) throw new MissingGrantMaterialError()

      // Vault detail carries the caller's wrapped VK; entry carries the sealed
      // content. Fetch both before touching any key material.
      const vault = await getVault(vaultId, privateKey, userId, { vaultKey: useAuthStore.getState().cacheVaultKey, discoveryKey: useAuthStore.getState().cacheVaultDiscoveryKey })
      const vaultKey = useAuthStore.getState().getVaultKey(vault.id)
      if (!vaultKey) throw new VaultLockedError()
      try {
        const [entry, agent] = await Promise.all([getEntry(vaultId, entryId, vaultKey), getAgent(agentId)])
        if (!agent.publicKey) throw new MissingGrantMaterialError()
        const envelope = await buildCanonicalGrantEnvelope({
          organizationId: vault.organizationId, vaultId, entryId, grantId, agentId,
          entryRevision: entry.currentRevision, memberKeyGeneration: vault.memberKeyGeneration,
          agentPublicKey: agent.publicKey, recipientKeyVersion: agent.recipientKeyVersion,
          approvedMethods: grantMethodsBits(methods), expiresAt: 'expiresAt' in policy ? policy.expiresAt : undefined,
          remainingUses: 'queryLimit' in policy ? policy.queryLimit : undefined, secret: entry.memberSecretModel,
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
    onSuccess: () => {
      // Invalidating the grants root refreshes every grant view — pending
      // queue, org-grants list, badges — via prefix match.
      queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
    },
  })
}
