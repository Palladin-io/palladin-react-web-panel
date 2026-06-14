import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { produceGrantEntryEnvelope } from '../../shared/crypto/grant-envelope'
import { unsealVaultKey } from '../../shared/crypto/vault-key'
import { wipe } from '../../shared/crypto/sodium'
import { getEntry, getVault } from '../vaults/api/vault-api'
import { approveGrant, type ApproveGrantBody } from './api/pending-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { serializeGrantMethods, type GrantMethod } from './grant-methods'
import { GRANTS_QUERY_KEY } from './query-keys'

/** Thrown when the vault key cannot be recovered (vault locked / no wrappedVK). */
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
 *   1. Recover VK: `unsealVaultKey(vault.wrappedVK, userPrivateKey)`.
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
      vaultId,
      entryId,
      agentPublicKey,
      policy,
      methods,
    }: ApproveGrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()

      // The agent public key + target entry are required to build the envelope.
      // The pending-grants endpoint does not yet return `agentPublicKey`, so we
      // fail loudly here instead of sending an envelope sealed to nothing.
      if (!agentPublicKey || !entryId) throw new MissingGrantMaterialError()

      // Vault detail carries the caller's wrapped VK; entry carries the sealed
      // content. Fetch both before touching any key material.
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

        const body: ApproveGrantBody = {
          grantEntry: { entryId, ...envelope },
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
