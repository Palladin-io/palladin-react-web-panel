import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { deactivateAgent } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'
import { authenticatedQueryKey } from '../auth'

export function useDeactivateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) => deactivateAgent(agentId),
    onSuccess: (_data, agentId) => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(AGENTS_QUERY_KEY) })
      queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(agentQueryKey(agentId)),
      })
    },
  })
}
