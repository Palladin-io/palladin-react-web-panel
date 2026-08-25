import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { getAgent } from '../agents'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { buildAgentWrappedVaultKey } from '../../shared/crypto/x25519-wrapper'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import {
  createGrantProactively,
  GRANT_TYPE_FULL,
  GRANT_TYPE_SCRIPT_EXECUTION,
  type CreateGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import {
  GRANT_METHOD_EXEC,
  grantMethodsFromMask,
  grantMethodsMask,
  parseGrantMethods,
  serializeGrantMethods,
} from './grant-methods'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'
import { buildCompleteScriptExecutionPackage } from '../vaults/script-execution-package'

const MANIFEST_SIGNING_PRIVATE_PURPOSE = 4

export interface RegrantInput {
  vaultId: string
  agentId: string
  entryId?: string
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
      type,
      policy,
      methods: serializedMethods,
    }: RegrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      const methods = parseGrantMethods(serializedMethods)
      if (!privateKey) throw new VaultLockedError()
      if (methods.length === 0 || (type !== GRANT_TYPE_FULL && !entryId)) {
        throw new MissingGrantMaterialError()
      }

      const [vault, agent] = await Promise.all([
        getEncryptedVault(vaultId),
        getAgent(agentId),
      ])
      if (!agent.publicKey || !agent.recipientKeyVersion || !agent.accessEpoch) {
        throw new MissingGrantMaterialError()
      }
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      const grantId = crypto.randomUUID()
      try {
        if (type === GRANT_TYPE_FULL) {
          const signingEnvelope = vault.vaultPrivateKeys.find(
            (candidate) => candidate.descriptor.purpose === MANIFEST_SIGNING_PRIVATE_PURPOSE
              && candidate.descriptor.keyVersion === vault.currentKeyEpoch.manifestSigningKeyVersion,
          )
          if (!signingEnvelope) throw new MissingGrantMaterialError()
          const vaultSigningPrivateKey = await openVaultDerivedEnvelope(signingEnvelope, vaultKey)
          let agentWrappedVaultKey
          try {
            agentWrappedVaultKey = await buildAgentWrappedVaultKey({
              vaultKey,
              organizationId: vault.organizationId,
              vaultId,
              grantId,
              agentId,
              agentAccessEpoch: agent.accessEpoch,
              vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
              recipientAgentKeyVersion: agent.recipientKeyVersion,
              agentPublicKey: agent.publicKey,
              vaultSigningKeyVersion: vault.currentKeyEpoch.manifestSigningKeyVersion,
              vaultSigningPrivateKey,
            })
          } finally {
            wipe(vaultSigningPrivateKey)
          }
          const body: CreateGrantBody = {
            grantId,
            agentId,
            type,
            agentWrappedVaultKey,
            ...policy,
            methods: serializeGrantMethods(grantMethodsFromMask(grantMethodsMask(methods))),
          }
          if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
          await createGrantProactively(vaultId, body)
          return
        }

        if (type === GRANT_TYPE_SCRIPT_EXECUTION) {
          if (methods.length !== 1 || methods[0] !== GRANT_METHOD_EXEC || !entryId) {
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
          if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
          await createGrantProactively(vaultId, {
            grantId,
            agentId,
            type,
            scriptEntryId: entryId,
            scriptPackage,
            ...policy,
            methods: serializeGrantMethods([GRANT_METHOD_EXEC]),
          })
          return
        }

        const detail = await getCanonicalEntry(vaultId, entryId!)
        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId: entryId!, revision: detail.currentRevision,
        })
        const approvedMethods = grantMethodsMask(methods)
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey: agent.publicKey,
          organizationId: detail.organizationId, vaultId, grantId, agentId, entryId: entryId!,
          entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
          memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: agent.recipientKeyVersion,
          approvedMethods, approvedFieldIds: listGrantableFieldIds(memberSecret),
          ...policy, ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
        })
        const body: CreateGrantBody = {
          grantId,
          agentId,
          type,
          entryId: entryId!,
          grantEntries: [envelope],
          ...policy,
          methods: serializeGrantMethods(grantMethodsFromMask(approvedMethods)),
        }
        if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
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
