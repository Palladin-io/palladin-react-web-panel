import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteAgent } from './api/agents-api'
import { AGENTS_QUERY_KEY } from './use-agents'

export function useDeleteAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: string) => deleteAgent(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
    },
  })
}
