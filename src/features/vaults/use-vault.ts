import { useQuery } from '@tanstack/react-query'
import { getVault } from './api/vault-api'
import { useAuthStore } from '../auth'

export function vaultQueryKey(id: string) {
  return ['vaults', id] as const
}

export function useVault(id: string) {
  const privateKey = useAuthStore((state) => state.privateKey)
  const memberId = useAuthStore((state) => state.userId)
  return useQuery({
    queryKey: vaultQueryKey(id),
    queryFn: () => {
      if (!privateKey || !memberId) throw new Error('Vault is locked')
      const auth = useAuthStore.getState()
      return getVault(id, privateKey, memberId, { vaultKey: auth.cacheVaultKey, discoveryKey: auth.cacheVaultDiscoveryKey })
    },
    enabled: privateKey !== null && memberId !== null,
    staleTime: 30_000,
  })
}
