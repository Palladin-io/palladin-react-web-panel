import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../auth'
import { openMemberSecret } from '../../shared/crypto/entry-protocol'
import { buildCanonicalGrantEnvelope } from '../../shared/crypto/grant-protocol'
import { listGrantableFieldIds } from '../../shared/crypto/vault-plaintext'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { buildAgentWrappedVaultKey } from '../../shared/crypto/x25519-wrapper'
import { getCanonicalEntry } from '../vaults/api/vault-api'
import { getEncryptedVault } from '../vaults/sync/member-sync-api'
import { useMemberSyncStore } from '../../shared/stores/member-sync-store'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_SCRIPT_EXECUTION,
  createFullGrant,
  createGranularGrant,
  createScriptExecutionGrant,
  type CreateFullGrantBody,
  type CreateGranularGrantBody,
  type CreateScriptExecutionGrantBody,
  type GrantType,
} from './api/org-grants-api'
import type { GrantPolicyBody } from './grant-policy'
import {
  GRANT_METHOD_EXEC,
  grantMethodsFromMask,
  grantMethodsMask,
  serializeGrantMethods,
  type GrantMethod,
} from './grant-methods'
import { MissingGrantMaterialError, VaultLockedError } from './use-approve-grant'
import { GRANT_MUTATION_INVALIDATION_KEYS } from './query-keys'
import { buildCompleteScriptExecutionPackage } from '../vaults/script-execution-package'
import { ENTRY_TYPE_CREDIT_CARD, normalizeEntryType } from '../../shared/types/entry-type'

const MANIFEST_SIGNING_PRIVATE_PURPOSE = 4

export interface CreateGrantInput {
  vaultId: string
  agentId: string
  agentPublicKey: string | null | undefined
  recipientAgentKeyVersion: number | null | undefined
  agentAccessEpoch: number | null | undefined
  type: GrantType
  entryId?: string
  reviewedScriptRevision?: string
  policy: GrantPolicyBody
  methods: GrantMethod[]
}

function assertCurrentUnlockSession(privateKey: Uint8Array): void {
  if (useAuthStore.getState().privateKey !== privateKey) throw new VaultLockedError()
}

export function useCreateGrant() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      vaultId,
      agentId,
      agentPublicKey,
      recipientAgentKeyVersion,
      agentAccessEpoch,
      type,
      entryId,
      reviewedScriptRevision,
      policy,
      methods,
    }: CreateGrantInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()
      const requestedMethods = grantMethodsMask(methods)
      if (requestedMethods === 0) throw new MissingGrantMaterialError()
      const grantId = crypto.randomUUID()

      if (!agentPublicKey || !recipientAgentKeyVersion || !agentAccessEpoch
        || (type !== GRANT_TYPE_FULL && !entryId)) {
        throw new MissingGrantMaterialError()
      }

      const vault = await getEncryptedVault(vaultId)
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      try {
        if (type === GRANT_TYPE_FULL) {
          assertCurrentUnlockSession(privateKey)
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
              agentAccessEpoch,
              vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
              recipientAgentKeyVersion,
              agentPublicKey,
              vaultSigningKeyVersion: vault.currentKeyEpoch.manifestSigningKeyVersion,
              vaultSigningPrivateKey,
            })
          } finally {
            wipe(vaultSigningPrivateKey)
          }
          const body: CreateFullGrantBody = {
            grantId,
            agentId,
            agentWrappedVaultKey,
            ...policy,
            methods: serializeGrantMethods(methods),
          }
          assertCurrentUnlockSession(privateKey)
          await createFullGrant(vaultId, body)
          return
        }

        if (type === GRANT_TYPE_SCRIPT_EXECUTION) {
          if (methods.length !== 1 || methods[0] !== GRANT_METHOD_EXEC
            || !entryId || !reviewedScriptRevision) {
            throw new MissingGrantMaterialError()
          }
          const scriptPackage = await buildCompleteScriptExecutionPackage({
            organizationId: vault.organizationId,
            vaultId,
            scriptEntryId: entryId,
            agentId,
            agentAccessEpoch,
            grantId,
            packageRevision: '1',
            recipientAgentKeyVersion,
            agentPublicKey,
            vaultKey,
          })
          if (scriptPackage.scriptRevision !== reviewedScriptRevision) {
            throw new MissingGrantMaterialError()
          }
          const body: CreateScriptExecutionGrantBody = {
            grantId,
            agentId,
            scriptPackage,
            ...policy,
            methods: serializeGrantMethods([GRANT_METHOD_EXEC]),
          }
          assertCurrentUnlockSession(privateKey)
          await createScriptExecutionGrant(vaultId, entryId, body)
          return
        }

        const syncedVault = useMemberSyncStore.getState().vaults.get(vaultId)
        if (!syncedVault || syncedVault.status !== 'ready') throw new MissingGrantMaterialError()

        const granularEntryId = entryId!
        const detail = await getCanonicalEntry(vaultId, granularEntryId)
        const memberSecret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId: granularEntryId,
          revision: detail.currentRevision,
        })
        if (normalizeEntryType(memberSecret.entryType) === ENTRY_TYPE_CREDIT_CARD) {
          throw new MissingGrantMaterialError()
        }
        const approvedMethods = requestedMethods
        const approvedFieldIds = listGrantableFieldIds(memberSecret)
        if (approvedMethods === 0 || approvedFieldIds.length === 0) {
          throw new MissingGrantMaterialError()
        }
        const envelope = await buildCanonicalGrantEnvelope({
          secret: memberSecret,
          agentPublicKey,
          organizationId: detail.organizationId, vaultId, grantId, agentId, entryId: granularEntryId,
          entryRevision: detail.currentRevision, grantEnvelopeRevision: '1', grantKeyVersion: 1,
          memberKeyGeneration: vault.memberKeyGeneration, recipientKeyVersion: recipientAgentKeyVersion,
          approvedMethods, approvedFieldIds,
          ...policy, ...('queryLimit' in policy ? { remainingUses: policy.queryLimit } : {}),
        })

        const body: CreateGranularGrantBody = {
          grantId,
          agentId,
          grantEntry: envelope,
          ...policy,
          methods: serializeGrantMethods(grantMethodsFromMask(approvedMethods)),
        }
        await createGranularGrant(vaultId, granularEntryId, body)
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
