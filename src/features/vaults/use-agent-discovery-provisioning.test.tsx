import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_VAULT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import { useAgentDiscoveryProvisioning } from './use-agent-discovery-provisioning'

const getAgentDiscoveryProvisioning = vi.hoisted(() => vi.fn())

vi.mock('./api/agent-discovery-api', async (importActual) => {
  const actual = await importActual<typeof import('./api/agent-discovery-api')>()
  return { ...actual, getAgentDiscoveryProvisioning }
})

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const agent = {
  agentId: '123e4567-e89b-42d3-a456-426614174000',
  agentName: 'Deploy Agent',
  recipientKeyVersion: 3,
  manifestRevision: '42',
}

describe('useAgentDiscoveryProvisioning', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAuthStore.setState({ permissions: PERMISSION_VAULT_MANAGE })
    getAgentDiscoveryProvisioning.mockReset()
  })

  afterEach(() => vi.useRealTimers())

  it('polls only while at least one Agent remains pending', async () => {
    getAgentDiscoveryProvisioning
      .mockResolvedValueOnce([{ ...agent, status: 'pending' }])
      .mockResolvedValue([{ ...agent, status: 'current' }])

    renderHook(() => useAgentDiscoveryProvisioning('vault-1'), { wrapper })
    await vi.waitFor(() => expect(getAgentDiscoveryProvisioning).toHaveBeenCalledTimes(1))

    await act(() => vi.advanceTimersByTimeAsync(15_000))
    await vi.waitFor(() => expect(getAgentDiscoveryProvisioning).toHaveBeenCalledTimes(2))

    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(getAgentDiscoveryProvisioning).toHaveBeenCalledTimes(2)
  })
})
