import { useQuery } from '@tanstack/react-query'
import { getPendingGrantDetail, getPendingGrants } from './api/pending-grants-api'
import { PENDING_GRANTS_QUERY_KEY } from './query-keys'
import { useAuthStore } from '../auth'
import { getEntry, getVault } from '../vaults/api/vault-api'
import { openEncryptedReason } from '../../shared/crypto/reason-protocol'
import { wipe } from '../../shared/crypto/sodium'

/**
 * Cross-vault list of GRANULAR grants awaiting the user's approval.
 *
 * `enabled` lets callers (e.g. the sidebar badge) gate the fetch on the
 * GrantManage permission so users without it never trigger a 403. Shares the
 * `['grants','pending']` key, so SignalR's `grant_pending` invalidation keeps
 * any consumer — list view or badge — live.
 */
export function usePendingGrants(enabled = true) {
  return useQuery({
    queryKey: PENDING_GRANTS_QUERY_KEY,
    queryFn: async () => {
      const grants = await getPendingGrants()
      const { privateKey, userId } = useAuthStore.getState()
      if (!privateKey || !userId) return grants
      const vaults = new Map<string, Awaited<ReturnType<typeof getVault>>>()
      return Promise.all(grants.map(async (grant) => {
        if (!grant.entryId || !grant.agentId) return grant
        try {
          const detail = await getPendingGrantDetail(grant.vaultId, grant.id)
          if (!detail.encryptedReason) return { ...grant, ...detail }
          let vault = vaults.get(grant.vaultId)
          if (!vault) {
            const auth = useAuthStore.getState()
            vault = await getVault(grant.vaultId, privateKey, userId, {
              vaultKey: auth.cacheVaultKey, discoveryKey: auth.cacheVaultDiscoveryKey,
            })
            vaults.set(grant.vaultId, vault)
          }
          const vaultKey = useAuthStore.getState().getVaultKey(grant.vaultId)
          if (!vaultKey) return { ...grant, ...detail }
          try {
            const [reason, entry] = await Promise.all([
              openEncryptedReason(detail.encryptedReason, vault.vaultPrivateKeys, vaultKey, {
              organizationId: vault.organizationId, vaultId: grant.vaultId,
              entryId: grant.entryId, grantId: grant.id, agentId: grant.agentId,
              }),
              getEntry(grant.vaultId, grant.entryId, vaultKey),
            ])
            return { ...grant, ...detail, reason, vaultName: vault.name, entryLabel: entry.label, urlDomain: entry.urlDomain }
          } finally { wipe(vaultKey) }
        } catch {
          return grant
        }
      }))
    },
    staleTime: 15_000,
    enabled,
  })
}
