import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth/stores/auth-store'
import { PERMISSION_AGENT_MANAGE } from '../../shared/lib/permissions'
import { getAgents } from './api/agents-api'

export const AGENTS_QUERY_KEY = ['agents'] as const

export function useAgents() {
  const permissions = useAuthStore((s) => s.permissions)
  const canManage = (permissions & PERMISSION_AGENT_MANAGE) !== 0

  return useQuery({
    queryKey: AGENTS_QUERY_KEY,
    queryFn: getAgents,
    staleTime: 30_000,
    enabled: canManage,
  })
}

export function useAgentPermissions() {
  const permissions = useAuthStore((s) => s.permissions)
  return {
    canManage: (permissions & PERMISSION_AGENT_MANAGE) !== 0,
  }
}
