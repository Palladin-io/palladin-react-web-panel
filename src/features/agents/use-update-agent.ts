import { useQueryClient } from '@tanstack/react-query'
import { useAuthenticatedMutation as useMutation } from '../auth'
import { updateAgent, type UpdateAgentInput } from './api/agents-api'
import { agentQueryKey } from './use-agent'
import { AGENTS_QUERY_KEY } from './use-agents'
import { authenticatedQueryKey } from '../auth'

export interface UpdateAgentVariables {
  agentId: string
  input: UpdateAgentInput
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ agentId, input }: UpdateAgentVariables) =>
      updateAgent(agentId, input),
    onSuccess: (_data, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: authenticatedQueryKey(AGENTS_QUERY_KEY) })
      queryClient.invalidateQueries({
        queryKey: authenticatedQueryKey(agentQueryKey(agentId)),
      })
    },
  })
}
