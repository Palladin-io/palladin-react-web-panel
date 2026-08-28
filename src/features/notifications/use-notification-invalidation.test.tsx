import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNotificationInvalidation } from './use-notification-invalidation'
import type { NotificationPayload } from './notification-types'
import {
  adjustPendingGrantNotificationSummary,
  resolvePendingGrantNotification,
} from '../../shared/lib/pending-grant-notification-reconciliation'

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useNotificationInvalidation(), { wrapper })
  return { client, invalidate: result.current, invalidateSpy }
}

function payload(type: string, data: Record<string, string> = {}): NotificationPayload {
  return {
    subjectId: data.grantId ?? '11111111-1111-4111-8111-111111111111',
    type,
    category: 'update',
    occurredAt: '2026-08-28T12:00:00Z',
    data,
  }
}

describe('useNotificationInvalidation', () => {
  it('invalidates the grants root (prefix covers pending + org lists) for every grant_* type', () => {
    for (const type of ['grant_pending', 'grant_approved', 'grant_denied', 'grant_revoked']) {
      const { invalidate, invalidateSpy } = setup()
      invalidate(payload(type))
      // Root invalidation prefix-matches ['grants','pending'] and ['grants','org'].
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grants'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    }
  })

  it('clears a local summary adjustment only for the matching terminal grant event', () => {
    const { client, invalidate } = setup()
    resolvePendingGrantNotification(client, 'grant-1')
    expect(adjustPendingGrantNotificationSummary(client, { pendingActionCount: 1 }))
      .toEqual({ pendingActionCount: 0 })

    invalidate(payload('grant_approved', { grantId: 'grant-1' }))

    expect(adjustPendingGrantNotificationSummary(client, { pendingActionCount: 1 }))
      .toEqual({ pendingActionCount: 1 })
  })

  it('invalidates agents for agent_pending', () => {
    const { invalidate, invalidateSpy } = setup()
    invalidate(payload('agent_pending'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents'] })
  })

  it('invalidates the entry detail when credential_accessed carries ids', () => {
    const { invalidate, invalidateSpy } = setup()
    invalidate(payload('credential_accessed', { vaultId: 'v1', entryId: 'e1' }))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents'] })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['vaults', 'v1', 'entries', 'e1'],
    })
  })

  it('skips entry invalidation when ids are missing', () => {
    const { invalidate, invalidateSpy } = setup()
    invalidate(payload('credential_accessed'))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['agents'] })
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(['vaults']) }),
    )
  })

  it('refreshes the inbox for an unknown future type', () => {
    const { invalidate, invalidateSpy } = setup()
    invalidate(payload('future_type'))
    expect(invalidateSpy).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
  })
})
