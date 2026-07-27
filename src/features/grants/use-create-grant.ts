import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getEntries, getEntry, getVault } from '../vaults/api/vault-api'
import { getAgent } from '../agents/api/agents-api'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_GRANULAR,
  createGrantProactively,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import { grantMethodsBits, serializeGrantMethods, type GrantMethod } from './grant-methods'
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
  /** Methods the grant permits (CVT-149) — at least one. */
  methods: GrantMethod[]
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
      methods,
    }: CreateGrantInput) => {
      const { privateKey, userId } = useAuthStore.getState()
      if (!privateKey || !userId) throw new VaultLockedError()
      if (!agentPublicKey) throw new MissingGrantMaterialError()
      if (type === GRANT_TYPE_GRANULAR && !entryId) {
        throw new MissingGrantMaterialError()
      }

      const auth = useAuthStore.getState()
      const vault = await getVault(vaultId, privateKey, userId, { vaultKey: auth.cacheVaultKey, discoveryKey: auth.cacheVaultDiscoveryKey })
      const vaultKey = useAuthStore.getState().getVaultKey(vault.id)
      if (!vaultKey) throw new VaultLockedError()
      try {
        const agent = await getAgent(agentId)
        if (!agent.publicKey) throw new MissingGrantMaterialError()
        const grantId = crypto.randomUUID()
        const build = (detail: Awaited<ReturnType<typeof getEntry>>) => buildCanonicalGrantEnvelope({
          organizationId: vault.organizationId, vaultId, entryId: detail.id, grantId, agentId,
          entryRevision: detail.currentRevision, memberKeyGeneration: vault.memberKeyGeneration,
          agentPublicKey: agent.publicKey!, recipientKeyVersion: agent.recipientKeyVersion,
          approvedMethods: grantMethodsBits(methods), expiresAt: 'expiresAt' in policy ? policy.expiresAt : undefined,
          remainingUses: 'queryLimit' in policy ? policy.queryLimit : undefined, secret: detail.memberSecretModel,
        })
        let body: CreateGrantBody

        if (type === GRANT_TYPE_FULL) {
          // Cover every entry currently in the vault. Fetch all entry details
          // in parallel — N sequential HTTP round-trips quickly dominate latency
          // for vaults with 10+ entries. Envelope production stays sequential
          // (it's CPU-bound on libsodium and already runs one-at-a-time anyway).
          const { items } = await getEntries(vaultId, vaultKey)
          const details = await Promise.all(
            items.map((item) => getEntry(vaultId, item.id, vaultKey)),
          )
          const grantEntries = []
          for (let i = 0; i < items.length; i++) {
            grantEntries.push(await build(details[i]))
          }
          body = { grantId, agentId, type: GRANT_TYPE_FULL, grantEntries, ...policy, methods: serializeGrantMethods(methods) }
        } else {
          const detail = await getEntry(vaultId, entryId!, vaultKey)
          const envelope = await build(detail)
          body = {
            grantId, agentId,
            type: GRANT_TYPE_GRANULAR,
            entryId,
            grantEntries: [envelope],
            ...policy,
            methods: serializeGrantMethods(methods),
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
