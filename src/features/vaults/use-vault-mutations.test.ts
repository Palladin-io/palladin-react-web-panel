import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMemberSyncStore } from './sync/member-sync-store'
import { useDeleteVault } from './use-delete-vault'
import { useUpdateVault } from './use-update-vault'

const api = vi.hoisted(() => ({
  updateVault: vi.fn(async () => ({})),
  deleteVault: vi.fn(async () => undefined),
}))

vi.mock('./api/vault-api', () => api)

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client }, children)
}

describe('Vault mutations and Member Sync', () => {
  beforeEach(() => {
    api.updateVault.mockClear()
    api.deleteVault.mockClear()
    useMemberSyncStore.getState().clear()
  })

  it('refreshes decrypted metadata after updating a Vault', async () => {
    const { result } = renderHook(() => useUpdateVault('vault-1'), { wrapper })

    result.current.mutate({ name: 'Updated' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
  })

  it('refreshes membership after deleting a Vault', async () => {
    const { result } = renderHook(() => useDeleteVault(), { wrapper })

    result.current.mutate('vault-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
  })
})
