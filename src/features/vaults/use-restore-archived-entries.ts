import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createEntryRestoreMaterial, decryptMemberSecret } from '../../shared/crypto/vault-v2-entry'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { openDiscoveryKey } from '../../shared/crypto/vault-v2-rotation'
import { wipe } from '../../shared/crypto/sodium'
import { useAuthStore } from '../auth'
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
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, {
        organizationId: vault.memberVaultKey.organizationId,
        vaultId,
        memberId: vault.memberVaultKey.memberId,
        vkVersion: vault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: vault.memberKeyGeneration,
      }, privateKey)
      let discoveryKey: Uint8Array | undefined
      const restored: string[] = []
      const failed: string[] = []
      try {
        discoveryKey = await openDiscoveryKey(vault.discoveryKey, vaultKey)
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
            const plaintext = await decryptMemberSecret(detail, vaultKey)
            const material = await createEntryRestoreMaterial(
              detail, plaintext, vaultKey, vault.currentKeyEpoch.vdkVersion, discoveryKey,
            )
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
        queryClient.invalidateQueries({ queryKey: entriesQueryKey(vaultId) }),
        ...restored.flatMap((entryId) => [
          queryClient.invalidateQueries({ queryKey: entryDetailQueryKey(vaultId, entryId) }),
          queryClient.invalidateQueries({ queryKey: entryHistoryQueryKey(vaultId, entryId) }),
        ]),
      ])
      useMemberSyncStore.getState().retry()
    },
  })
}
