import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { AgentApprovalRequiresUnlockError, useApproveAgent } from './use-approve-agent'

const mocks = vi.hoisted(() => ({
  approveAgent: vi.fn(),
  reconcileAgentDiscovery: vi.fn(),
}))

vi.mock('./api/agents-api', () => ({ approveAgent: mocks.approveAgent }))
vi.mock('../vaults/sync/agent-discovery-reconciler', () => ({
  reconcileAgentDiscovery: mocks.reconcileAgentDiscovery,
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useApproveAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().logout()
    mocks.approveAgent.mockResolvedValue(undefined)
    mocks.reconcileAgentDiscovery.mockResolvedValue(undefined)
  })

  it('fails closed before activation when the Vault is locked', async () => {
    const { result } = renderHook(() => useApproveAgent(), { wrapper })

    await expect(act(() => result.current.mutateAsync({ agentId: crypto.randomUUID() })))
      .rejects.toBeInstanceOf(AgentApprovalRequiresUnlockError)
    expect(mocks.approveAgent).not.toHaveBeenCalled()
    expect(mocks.reconcileAgentDiscovery).not.toHaveBeenCalled()
  })

  it('does not complete approval until Discovery is provisioned', async () => {
    const privateKey = new Uint8Array(32).fill(7)
    useAuthStore.setState({ privateKey, isVaultLocked: false })
    const { result } = renderHook(() => useApproveAgent(), { wrapper })

    const outcome = await act(() => result.current.mutateAsync({
      agentId: crypto.randomUUID(),
      input: { name: 'Runtime' },
    }))

    expect(mocks.approveAgent).toHaveBeenCalledOnce()
    expect(mocks.reconcileAgentDiscovery).toHaveBeenCalledWith(
      privateKey,
      expect.any(AbortSignal),
    )
    expect(outcome).toEqual({ discoveryReady: true })
  })

  it('reports pending Discovery when activation committed but provisioning failed', async () => {
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(8), isVaultLocked: false })
    mocks.reconcileAgentDiscovery.mockRejectedValueOnce(new TypeError('offline'))
    const { result } = renderHook(() => useApproveAgent(), { wrapper })

    const outcome = await act(() => result.current.mutateAsync({ agentId: crypto.randomUUID() }))

    expect(outcome).toEqual({ discoveryReady: false })
    expect(mocks.approveAgent).toHaveBeenCalledOnce()
  })
})
