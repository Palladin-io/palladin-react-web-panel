import { useQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey } from '../auth'
import { BUILTIN_AGENT_TYPES, getAgentTypes } from './api/agents-api'

export function useAgentTypes() {
  const queryKey = useAuthenticatedQueryKey(['agent-types'])
  return useQuery({
    queryKey,
    queryFn: getAgentTypes,
    initialData: BUILTIN_AGENT_TYPES,
    staleTime: 5 * 60 * 1000,
  })
}
