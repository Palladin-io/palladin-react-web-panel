import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey } from '../auth'
import { getVaults } from './api/vault-api'

export const VAULTS_QUERY_KEY = ['vaults'] as const

export function useVaults(options: { enabled?: boolean } = {}) {
  const queryKey = useAuthenticatedQueryKey(VAULTS_QUERY_KEY)
  return useQuery({
    queryKey,
    queryFn: getVaults,
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  })
}
