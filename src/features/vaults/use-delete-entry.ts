import { useMutation, useQueryClient } from '@tanstack/react-query'
import { openMemberSecret, sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
import { deleteEntry, getCanonicalEntry } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import { useMemberSyncStore } from './sync/member-sync-store'
import { VAULTS_QUERY_KEY } from './use-vaults'

export function useDeleteEntry(vaultId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entryId: string) => {
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new Error('Vault is locked')
      const [vault, detail] = await Promise.all([
        getEncryptedVault(vaultId), getCanonicalEntry(vaultId, entryId),
      ])
      if (useAuthStore.getState().privateKey !== privateKey) throw new Error('Vault was locked while deleting Entry')
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      let discoveryKey: Uint8Array | undefined
      try {
        discoveryKey = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
        const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
        })
        const envelopes = await sealCanonicalEntry({
          organizationId: detail.organizationId, vaultId, entryId,
          revision: (BigInt(detail.currentRevision) + 1n).toString(),
          entryKeyRevision: (BigInt(detail.entryKey.descriptor.resourceRevision) + 1n).toString(),
          entryKeyVersion: detail.currentKeyVersion + 1,
          memberIndexRevision: (BigInt(detail.memberIndexRevision) + 1n).toString(),
          vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
          vdkVersion: vault.currentKeyEpoch.vdkVersion,
          memberKeyGeneration: vault.memberKeyGeneration,
        }, secret, vaultKey, discoveryKey, 5)
        if (useAuthStore.getState().privateKey !== privateKey) throw new Error('Vault was locked while deleting Entry')
        const response = await deleteEntry(vaultId, entryId, {
          baseRevision: detail.currentRevision,
          newEntryKey: envelopes.entryKey,
          memberSecret: envelopes.memberSecret,
          memberIndex: envelopes.memberIndex,
        })
        if (useAuthStore.getState().privateKey === privateKey) {
          const current = useMemberSyncStore.getState().vaults.get(vaultId)?.entries.get(entryId)
          if (current) {
            useMemberSyncStore.getState().reconcileEntry(vaultId, {
              ...current, state: 'deleted', currentRevision: response.currentRevision,
              currentKeyVersion: envelopes.entryKey.descriptor.keyVersion,
              memberIndexRevision: envelopes.memberIndex.descriptor.resourceRevision,
            })
          }
        }
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
      useMemberSyncStore.getState().retry()
    },
  })
}
