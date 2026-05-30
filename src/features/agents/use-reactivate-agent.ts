import { useMutation, useQueryClient } from '@tanstack/react-query'
import { reactivateAgent } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'

export function useReactivateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) => reactivateAgent(agentId),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) })
    },
  })
}
