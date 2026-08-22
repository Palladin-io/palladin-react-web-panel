import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { openMemberSecret, sealCanonicalEntry } from '../../shared/crypto/entry-protocol'
import { openMemberVaultKey, openVaultDerivedEnvelope } from '../../shared/crypto/vault-protocol'
import { wipe } from '../../shared/crypto/sodium'
import { authenticatedQueryKey, useAuthStore } from '../auth'
import { getCanonicalEntry, restoreCanonicalEntry } from './api/vault-api'
import { getEncryptedVault } from './sync/member-sync-api'
import { useMemberSyncStore } from './sync/member-sync-store'
import { entriesQueryKey, entryDetailQueryKey, entryHistoryQueryKey } from './use-entries'

export interface RestoreArchivedResult {
  restored: string[]
  failed: string[]
}

export function useRestoreArchivedEntries(vaultId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (entryIds: string[]): Promise<RestoreArchivedResult> => {
      const uniqueEntryIds = [...new Set(entryIds)]
      if (uniqueEntryIds.length === 0) return { restored: [], failed: [] }
      const privateKey = useAuthStore.getState().privateKey
      if (!privateKey) throw new Error('Vault is locked')
      const vault = await getEncryptedVault(vaultId)
      if (useAuthStore.getState().privateKey !== privateKey) throw new Error('Vault was locked while restoring Entries')
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      let discoveryKey: Uint8Array | undefined
      const restored: string[] = []
      const failed: string[] = []
      try {
        discoveryKey = await openVaultDerivedEnvelope(vault.discoveryKey, vaultKey)
        // Deliberately sequential: at most one decrypted MemberSecret and its
        // derived EntryDEK material exist at a time during a bulk restore.
        for (const [index, entryId] of uniqueEntryIds.entries()) {
          // Identity, rather than mere presence, matters here: lock wipes the
          // captured key, and a subsequent unlock installs a different key.
          if (useAuthStore.getState().privateKey !== privateKey) {
            failed.push(...uniqueEntryIds.slice(index))
            break
          }
          try {
            const detail = await getCanonicalEntry(vaultId, entryId)
            if (detail.state !== 'archived' && detail.state !== 'deleted'
              && detail.state !== 2 && detail.state !== 3) {
              throw new Error('Only an Archived or Deleted Entry can be restored')
            }
            const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
              organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
            })
            const nextRevision = (BigInt(detail.currentRevision) + 1n).toString()
            const envelopes = await sealCanonicalEntry({
              organizationId: detail.organizationId, vaultId, entryId,
              revision: nextRevision,
              entryKeyRevision: (BigInt(detail.entryKey.descriptor.resourceRevision) + 1n).toString(),
              entryKeyVersion: detail.currentKeyVersion + 1,
              memberIndexRevision: (BigInt(detail.memberIndexRevision) + 1n).toString(),
              agentDiscoveryRevision: (BigInt(detail.agentDiscoveryRevisionHighWatermark) + 1n).toString(),
              vaultKeyVersion: vault.currentKeyEpoch.vaultKeyVersion,
              vdkVersion: vault.currentKeyEpoch.vdkVersion,
              memberKeyGeneration: vault.memberKeyGeneration,
            }, secret, vaultKey, discoveryKey, 4)
            const material = {
              baseRevision: detail.currentRevision,
              newEntryKey: envelopes.entryKey,
              memberSecret: envelopes.memberSecret,
              memberIndex: envelopes.memberIndex,
              ...(envelopes.agentDiscovery ? { agentDiscovery: envelopes.agentDiscovery } : {}),
            }
            // Do not commit ciphertext produced by a crypto session that was
            // invalidated while the asynchronous preparation was running.
            if (useAuthStore.getState().privateKey !== privateKey) {
              failed.push(...uniqueEntryIds.slice(index))
              break
            }
            const response = await restoreCanonicalEntry(vaultId, entryId, material)
            const current = useMemberSyncStore.getState().vaults.get(vaultId)?.entries.get(entryId)
            if (current) {
              useMemberSyncStore.getState().reconcileEntry(vaultId, {
                ...current,
                state: 'active',
                currentRevision: response.currentRevision,
              })
            }
            restored.push(entryId)
          } catch {
            failed.push(entryId)
          }
        }
        return { restored, failed }
      } finally {
        wipe(vaultKey)
        if (discoveryKey) wipe(discoveryKey)
      }
    },
    onSuccess: async ({ restored }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: authenticatedQueryKey(entriesQueryKey(vaultId)),
        }),
        ...restored.flatMap((entryId) => [
          queryClient.invalidateQueries({
            queryKey: authenticatedQueryKey(entryDetailQueryKey(vaultId, entryId)),
          }),
          queryClient.invalidateQueries({
            queryKey: authenticatedQueryKey(entryHistoryQueryKey(vaultId, entryId)),
          }),
        ]),
      ])
      useMemberSyncStore.getState().retry()
    },
  })
}
