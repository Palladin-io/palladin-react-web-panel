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

/**
 * Agent list for read-only name resolution (e.g. the audit log), NOT gated on
 * AgentManage — a viewer with another permission (e.g. AuditView) must still be
 * able to map agent ids to names. The caller passes `enabled` (its own view
 * gate). Shares `AGENTS_QUERY_KEY` so it reuses the same cache as `useAgents`
 * with no extra request. This is a stopgap until the backend denormalises
 * `agentName` onto audit rows.
 */
export function useAgentNames(enabled = true) {
  return useQuery({
    queryKey: AGENTS_QUERY_KEY,
    queryFn: getAgents,
    staleTime: 30_000,
    enabled,
  })
}
