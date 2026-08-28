import { useMutation, useQueryClient } from '@tanstack/react-query'
import { sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import { toMemberSecret, type AgentVisibilityPolicy } from '../../shared/crypto/entry-draft'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { GRANT_DELIVERY_POLICY_NAME } from '../../shared/crypto/grant-protocol'
import { createEntry, issueEntryCreationChallenge, updateCanonicalEntry } from './api/vault-api'
import { deleteEncryptedAsset } from './assets/encrypted-asset-api'
import { encryptAndUploadPresentationAsset } from './assets/encrypted-asset-service'
import { getEncryptedVault } from './sync/member-sync-api'
import { ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_SCRIPT, type EntryPlaintext, type EntryType } from './types'
import { entriesQueryKey } from './use-entries'
import { vaultQueryKey } from './use-vault'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked — unlock before creating an entry')
    this.name = 'VaultLockedError'
  }
}

export class MissingWrappedVaultKeyError extends Error {
  constructor() {
    super('Vault is missing a wrapped VK — cannot derive the encryption key')
    this.name = 'MissingWrappedVaultKeyError'
  }
}

export interface CreateEntryInput {
  vaultId: string
  label: string
  agentLabel: string
  description?: string
  iconReference?: string
  iconFile?: File
  type: EntryType
  payload: EntryPlaintext
  policy: AgentVisibilityPolicy
}

function deliveryPolicyFor(type: EntryType) {
  return type === ENTRY_TYPE_SCRIPT
    ? GRANT_DELIVERY_POLICY_NAME.execOnly
    : type === ENTRY_TYPE_CREDIT_CARD
      ? GRANT_DELIVERY_POLICY_NAME.injectOnly
      : GRANT_DELIVERY_POLICY_NAME.standard
}

export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEntryInput) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new VaultLockedError()

      const [vault, challenge] = await Promise.all([
        getEncryptedVault(input.vaultId),
        issueEntryCreationChallenge(input.vaultId),
      ])

      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
        // A blob preview never enters encrypted domain state. An uploaded icon
        // is attached in revision 2 after the Entry exists because entry-scoped
        // asset authorization deliberately rejects unknown Entry IDs.
        const secret = toMemberSecret({
          ...input,
          ...(input.iconFile ? { iconReference: undefined } : {}),
          vaultId: input.vaultId,
        })
        const material = await sealCanonicalEntry({
          organizationId: vault.memberVaultKey.wrappedVaultKey.descriptor.scope.organizationId,
          vaultId: vault.id,
          entryId: challenge.entryId,
          revision: '1',
          vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
          vdkVersion: vault.currentKeyEpoch.vdkVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, secret, vaultKey, discoveryKey, 1)
        const created = await createEntry(input.vaultId, {
          entryId: challenge.entryId,
          ...material,
          deliveryPolicy: deliveryPolicyFor(input.type),
        })
        if (!input.iconFile) return created

        let uploadedAssetId: string | undefined
        try {
          const uploaded = await encryptAndUploadPresentationAsset({
            file: input.iconFile,
            scope: {
              organizationId: vault.memberVaultKey.wrappedVaultKey.descriptor.scope.organizationId,
              vaultId: input.vaultId,
              entryId: challenge.entryId,
              target: 2,
              keyVersion: vault.currentKeyEpoch.vaultKeyVersion,
              memberKeyGeneration: vault.memberKeyGeneration,
            },
            baseKey: vaultKey,
          })
          uploadedAssetId = uploaded.assetId
          const secretWithIcon = toMemberSecret({
            ...input,
            iconReference: `vault-asset:${uploaded.assetId}`,
            vaultId: input.vaultId,
          })
          const revision = (BigInt(created.currentRevision) + 1n).toString()
          const withIcon = await sealCanonicalEntry({
            organizationId: vault.memberVaultKey.wrappedVaultKey.descriptor.scope.organizationId,
            vaultId: vault.id,
            entryId: challenge.entryId,
            revision,
            entryKeyRevision: '1',
            entryKeyVersion: 2,
            memberIndexRevision: revision,
            agentDiscoveryRevision: revision,
            vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
            vdkVersion: vault.currentKeyEpoch.vdkVersion,
            memberKeyGeneration: vault.memberKeyGeneration,
          }, secretWithIcon, vaultKey, discoveryKey, 2)
          await updateCanonicalEntry(input.vaultId, challenge.entryId, {
            baseRevision: created.currentRevision,
            newEntryKey: withIcon.entryKey,
            memberSecret: withIcon.memberSecret,
            memberIndex: withIcon.memberIndex,
            agentDiscoveryChanged: false,
            deliveryPolicy: deliveryPolicyFor(input.type),
            grantEnvelopes: [],
          })
          return { ...created, currentRevision: revision }
        } catch (error) {
          if (uploadedAssetId) {
            await deleteEncryptedAsset(input.vaultId, uploadedAssetId).catch(() => undefined)
          }
          throw error
        }
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: entriesQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: vaultQueryKey(variables.vaultId) })
      queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      // The entries list is backed by the decrypted member-sync store rather
      // than React Query. Pull the committed delta immediately so returning
      // from the selected entry never waits for the background sync interval.
      useMemberSyncStore.getState().retry()
    },
  })
}
