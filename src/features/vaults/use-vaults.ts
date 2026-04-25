import { useQuery } from '@tanstack/react-query'
import { getVaults } from './api/vault-api'

export const VAULTS_QUERY_KEY = ['vaults'] as const

export function useVaults() {
  return useQuery({
    queryKey: VAULTS_QUERY_KEY,
    queryFn: getVaults,
    staleTime: 30_000,
  })
}
