import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const denyGrant = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('./api/pending-grants-api', () => ({ denyGrant }))

import { NOTIFICATIONS_CACHE_SUMMARY_KEY } from '../../shared/lib/pending-grant-notification-reconciliation'
import { useDenyGrant } from './use-deny-grant'

const notificationsListQueryKey = (category: string) =>
  ['notifications', 'list', category] as const

interface NotificationsSummary {
  unreadCount: number
  pendingActionCount: number
}

describe('useDenyGrant', () => {
  it('registers the resolved notification tombstone from the shared mutation', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    client.setQueryData(notificationsListQueryKey('all'), {
      pages: [{
        items: [{ type: 'grant_pending', metadata: { grantId: 'grant-1' } }],
        nextCursor: null,
      }],
      pageParams: [undefined],
    })
    client.setQueryData<NotificationsSummary>(NOTIFICATIONS_CACHE_SUMMARY_KEY, {
      unreadCount: 1,
      pendingActionCount: 1,
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useDenyGrant(), { wrapper })

    await result.current.mutateAsync({ vaultId: 'vault-1', grantId: 'grant-1' })

    expect(client.getQueryData<{ pages: { items: unknown[] }[] }>(notificationsListQueryKey('all'))
      ?.pages[0].items).toEqual([])
    expect(client.getQueryData<NotificationsSummary>(NOTIFICATIONS_CACHE_SUMMARY_KEY)
      ?.pendingActionCount).toBe(0)
  })
})
