import { useMutation, useQueryClient } from '@tanstack/react-query'
import { approveAgent } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'

export function useApproveAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) => approveAgent(agentId),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) })
    },
  })
}
