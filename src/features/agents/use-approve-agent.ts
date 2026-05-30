import { useMutation, useQueryClient } from '@tanstack/react-query'
import { approveAgent, type ApproveAgentInput } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'

export function useApproveAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      agentId,
      input,
    }: {
      agentId: string
      input?: ApproveAgentInput
    }) => approveAgent(agentId, input),
    onSuccess: (_data, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) })
    },
  })
}
