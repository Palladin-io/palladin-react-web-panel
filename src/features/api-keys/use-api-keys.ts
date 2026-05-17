import { useQuery } from '@tanstack/react-query'
import { getApiKeys } from './api/api-keys-api'

export const API_KEYS_QUERY_KEY = ['api-keys'] as const

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: getApiKeys,
    staleTime: 30_000,
  })
}
