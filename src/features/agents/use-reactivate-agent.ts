import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { reactivateAgent } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'
import { authenticatedQueryKey } from '../auth'

export function useReactivateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) => reactivateAgent(agentId),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(AGENTS_QUERY_KEY) })
      queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(agentQueryKey(agentId)),
      })
    },
  })
}
