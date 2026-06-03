import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { AGENTS_QUERY_KEY } from '../agents/use-agents'
import { GRANTS_QUERY_KEY, PENDING_GRANTS_QUERY_KEY } from '../grants'
import { entryDetailQueryKey } from '../vaults/use-entries'
import type { NotificationPayload } from './notification-types'

/**
 * Maps an incoming notification to the TanStack Query keys that should be
 * invalidated so the affected lists/detail panels refetch.
 *
 * Shared by both transports (SignalR push and FCM foreground messages) so the
 * invalidation policy lives in exactly one place.
 */
export function useNotificationInvalidation() {
  const queryClient = useQueryClient()

  return useCallback(
    (payload: NotificationPayload) => {
      const { type, data } = payload

      switch (type) {
        case 'grant_pending':
        case 'grant_approved':
        case 'grant_denied':
        case 'grant_revoked': {
          // Grant lifecycle changes affect both the full grants list and the
          // pending-approval queue (dashboard badge).
          queryClient.invalidateQueries({ queryKey: GRANTS_QUERY_KEY })
          queryClient.invalidateQueries({ queryKey: PENDING_GRANTS_QUERY_KEY })
          break
        }

        case 'agent_pending': {
          queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
          break
        }

        case 'credential_accessed': {
          // An access event changes the agent's activity and the entry's logs.
          queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
          // Entry-level logs live under the entry detail key — only invalidate
          // when we actually know which entry/vault was touched.
          if (data.vaultId && data.entryId) {
            queryClient.invalidateQueries({
              queryKey: entryDetailQueryKey(data.vaultId, data.entryId),
            })
          }
          break
        }

        default:
          // Unknown type — nothing to invalidate. The toast still fires so the
          // user is informed even for a type the client doesn't model yet.
          break
      }
    },
    [queryClient],
  )
}
