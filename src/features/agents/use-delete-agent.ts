import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { deleteAgent } from './api/agents-api'
import { AGENTS_QUERY_KEY } from './use-agents'
import { authenticatedQueryKey } from '../auth'

export function useDeleteAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) => deleteAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(AGENTS_QUERY_KEY) })
    },
  })
}
