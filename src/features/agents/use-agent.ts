import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey } from '../auth'
import { getAgent } from './api/agents-api'

export function agentQueryKey(agentId: string) {
  return ['agents', agentId] as const
}

export function useAgent(agentId: string) {
  const queryKey = useAuthenticatedQueryKey(agentQueryKey(agentId))
  return useQuery({
    queryKey,
    queryFn: () => getAgent(agentId),
    staleTime: 30_000,
    enabled: agentId.length > 0,
  })
}
