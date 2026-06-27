import { useInfiniteQuery } from '@tanstack/react-query'
import {
  getVaultAuditLogs,
  type GetVaultAuditLogsParams,
} from './api/audit-api'

export const AUDIT_LOGS_QUERY_KEY = ['audit-logs'] as const

/** Larger default page than the list shells: the entry tab over-fetches the
 *  vault log and filters to a single entry client-side, so a bigger page keeps
 *  enough entry-relevant rows visible without immediately paging. */
const PAGE_SIZE = 100

/**
 * Vault-scoped audit log as an infinite query (newest-first, cursor-paginated).
 * Server filters (`actions`, `agentId`) live in the query key so each filter
 * combination caches independently. Gated by `enabled` so callers without the
 * AuditView permission never trigger a 403.
 */
export function useVaultAuditLogs(
  vaultId: string,
  params: Omit<GetVaultAuditLogsParams, 'cursor' | 'pageSize'> = {},
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, vaultId, params] as const,
    queryFn: ({ pageParam }) =>
      getVaultAuditLogs(vaultId, {
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
