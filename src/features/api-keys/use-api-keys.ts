import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth/stores/auth-store'
import { PERMISSION_READ_API_KEY, PERMISSION_WRITE_API_KEY } from '../../shared/lib/permissions'
import { getApiKeys } from './api/api-keys-api'

export const API_KEYS_QUERY_KEY = ['api-keys'] as const

export function useApiKeys() {
  const permissions = useAuthStore((s) => s.permissions)
  const canRead = (permissions & PERMISSION_READ_API_KEY) !== 0

  return useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: getApiKeys,
    staleTime: 30_000,
    enabled: canRead,
  })
}

export function useApiKeyPermissions() {
  const permissions = useAuthStore((s) => s.permissions)
  return {
    canRead: (permissions & PERMISSION_READ_API_KEY) !== 0,
    canWrite: (permissions & PERMISSION_WRITE_API_KEY) !== 0,
  }
}
