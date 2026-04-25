import { useQuery } from '@tanstack/react-query'
import { getVault } from './api/vault-api'

export function vaultQueryKey(id: string) {
  return ['vaults', id] as const
}

export function useVault(id: string) {
  return useQuery({
    queryKey: vaultQueryKey(id),
    queryFn: () => getVault(id),
    enabled: id.length > 0,
    staleTime: 30_000,
  })
}
