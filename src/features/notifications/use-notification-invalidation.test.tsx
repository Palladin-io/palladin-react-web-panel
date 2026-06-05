import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNotificationInvalidation } from './use-notification-invalidation'
import type { NotificationPayload } from './notification-types'

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useNotificationInvalidation(), { wrapper })
  return { invalidate: result.current, invalidateSpy }
}

function payload(type: string, data: Record<string, string> = {}): NotificationPayload {
  return { type, title: 'T', body: 'B', data }
}

describe('useNotificationInvalidation', () => {
  it('invalidates the grants root (prefix covers pending + org lists) for every grant_* type', () => {
    for (const type of ['grant_pending', 'grant_approved', 'grant_denied', 'grant_revoked']) {
      const { invalidate, invalidateSpy } = setup()
      invalidate(payload(type))
      // Root invalidation prefix-matches ['grants','pending'] and ['grants','org'].
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['grants'] })
    }
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

  it('does nothing for an unknown type', () => {
    const { invalidate, invalidateSpy } = setup()
    invalidate(payload('future_type'))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
