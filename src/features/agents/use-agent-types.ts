import { useQuery } from '@tanstack/react-query'
import { BUILTIN_AGENT_TYPES, getAgentTypes } from './api/agents-api'

export function useAgentTypes() {
  return useQuery({
    queryKey: ['agent-types'],
    queryFn: getAgentTypes,
    placeholderData: BUILTIN_AGENT_TYPES,
    staleTime: 5 * 60 * 1000,
  })
}
