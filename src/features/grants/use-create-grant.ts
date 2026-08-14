import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope, grantMethodsForSecret } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { useMemberSyncStore } from '../../shared/stores/member-sync-store'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_GRANULAR,
  createGrantProactively,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import {
  grantMethodsFromMask,
  grantMethodsMask,
  serializeGrantMethods,
  type GrantMethod,
} from './grant-methods'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'

export interface CreateGrantInput {
  vaultId: string
  agentId: string
  agentPublicKey: string | null | undefined
  recipientAgentKeyVersion: number | null | undefined
  type: GrantType
  entryId?: string
  policy: GrantPolicyBody
  methods: GrantMethod[]
}

export function useCreateGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      vaultId,
      agentId,
      agentPublicKey,
      recipientAgentKeyVersion,
      type,
      entryId,
      policy,
      methods,
    }: CreateGrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      if (!agentPublicKey || !recipientAgentKeyVersion
        || (type === GRANT_TYPE_GRANULAR && !entryId)) throw new MissingGrantMaterialError()

      const syncedVault = useMemberSyncStore.getState().vaults.get(vaultId)
      if (!syncedVault || syncedVault.status !== 'ready') throw new MissingGrantMaterialError()
      const entryIds = type === GRANT_TYPE_FULL
        ? [...syncedVault.entries.values()].filter((entry) => entry.state === 'active' && !entry.corrupt)
          .map((entry) => entry.entryId)
        : [entryId!]
      if (entryIds.length === 0) throw new MissingGrantMaterialError()

      const vault = await getEncryptedVault(vaultId)
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      const grantId = crypto.randomUUID()
      const requestedMethods = grantMethodsMask(methods)
      try {
        const details = []
        let approvedMethods = requestedMethods
        // A grant has one backend Methods value, while each authenticated envelope repeats it.
        // Derive the common fail-closed set from the authoritative MemberSecrets before sealing
        // any envelope. Decrypt sequentially and retain only ciphertext details, never a
        // vault-sized array of plaintext secrets.
        for (const currentEntryId of entryIds) {
          const detail = await getCanonicalEntry(vaultId, currentEntryId)
          const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
            organizationId: detail.organizationId, vaultId, entryId: currentEntryId,
            revision: detail.currentRevision,
          })
          approvedMethods &= grantMethodsForSecret(memberSecret, requestedMethods)
          details.push({ currentEntryId, detail })
        }
        if (approvedMethods === 0) throw new MissingGrantMaterialError()

        const grantEntries = []
        // Sequential processing bounds decrypted MemberSecret residency and avoids a vault-sized
        // Promise.all of plaintext payloads. The final ciphertext array is required atomically.
        for (const { currentEntryId, detail } of details) {
          const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
            organizationId: detail.organizationId, vaultId, entryId: currentEntryId,
            revision: detail.currentRevision,
          })
          const envelope = await buildCanonicalGrantEnvelope({
            secret: memberSecret,
            agentPublicKey,
            organizationId: detail.organizationId, vaultId, grantId, agentId, entryId: currentEntryId,
            entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
            memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: recipientAgentKeyVersion,
            approvedMethods, approvedFieldIds: listGrantableFieldIds(memberSecret),
            ...policy, ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
          })
          grantEntries.push(envelope)
        }

        const body: CreateGrantBody = {
          grantId,
          agentId,
          type,
          ...(type === GRANT_TYPE_GRANULAR ? { entryId } : {}),
          grantEntries,
          ...policy,
          methods: serializeGrantMethods(grantMethodsFromMask(approvedMethods)),
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
