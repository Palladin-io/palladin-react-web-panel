import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuthenticatedQueryKey } from '../auth'
import { getOrgAuditLogs, type GetOrgAuditLogsParams } from './api/audit-api'

export const ORG_AUDIT_LOGS_QUERY_KEY = ['audit-logs', 'org'] as const

const PAGE_SIZE = 25

/**
 * Org-wide audit log as an infinite query (newest-first, cursor-paginated) —
 * backs the global Audit Log screen. Server filters (`vaultId`, `agentId`,
 * `eventType`, `from`, `to`) live in the query key so each combination caches
 * independently. Gated by `enabled` so callers without AuditView never 403.
 */
export function useOrgAuditLogs(
  params: Omit<GetOrgAuditLogsParams, 'cursor' | 'pageSize'> = {},
  enabled = true,
) {
  const queryKey = useAuthenticatedQueryKey([...ORG_AUDIT_LOGS_QUERY_KEY, params])
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getOrgAuditLogs({
        ...params,
        pageSize: PAGE_SIZE,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 15_000,
    enabled,
  })
}
