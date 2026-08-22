import { useQuery } from '@tanstack/react-query'
import { getAgent } from './api/agents-api'

export function agentQueryKey(agentId: string) {
  return ['agents', agentId] as const
}

export function useAgent(agentId: string) {
  return useQuery({
    queryKey: agentQueryKey(agentId),
    queryFn: () => getAgent(agentId),
    staleTime: 30_000,
    enabled: agentId.length > 0,
  })
}
