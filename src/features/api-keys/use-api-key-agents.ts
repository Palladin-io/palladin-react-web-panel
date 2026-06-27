import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth/stores/auth-store'
import { PERMISSION_READ_API_KEY } from '../../shared/lib/permissions'
import { getApiKeyAgents } from './api/api-keys-api'

export const apiKeyAgentsQueryKey = (apiKeyId: string) =>
  ['api-keys', apiKeyId, 'agents'] as const

/**
 * Infinite (cursor-paginated) list of agents that last authenticated with the
 * given API key. Gated on the api-keys read permission and a present key id.
 */
export function useApiKeyAgents(apiKeyId: string | undefined) {
  const permissions = useAuthStore((s) => s.permissions)
  const canRead = (permissions & PERMISSION_READ_API_KEY) !== 0

  return useInfiniteQuery({
    queryKey: apiKeyAgentsQueryKey(apiKeyId ?? ''),
    queryFn: ({ pageParam }) => getApiKeyAgents(apiKeyId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
    enabled: !!apiKeyId && canRead,
  })
}
