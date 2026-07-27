import { useQuery } from '@tanstack/react-query'
import { getVaults } from './api/vault-api'
import { useAuthStore } from '../auth'

export const VAULTS_QUERY_KEY = ['vaults'] as const

export function useVaults(options: { enabled?: boolean } = {}) {
  const privateKey = useAuthStore((state) => state.privateKey)
  const memberId = useAuthStore((state) => state.userId)
  return useQuery({
    queryKey: VAULTS_QUERY_KEY,
    queryFn: () => {
      if (!privateKey || !memberId) throw new Error('Vault is locked')
      const auth = useAuthStore.getState()
      return getVaults(privateKey, memberId, { vaultKey: auth.cacheVaultKey, discoveryKey: auth.cacheVaultDiscoveryKey })
    },
    staleTime: 30_000,
    enabled: (options.enabled ?? true) && privateKey !== null && memberId !== null,
  })
}
