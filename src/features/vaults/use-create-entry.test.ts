import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useCreateEntry } from './use-create-entry'
import { ENTRY_TYPE_KEY } from './types'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { entriesQueryKey } from './use-entries'

const { createEntryMock } = vi.hoisted(() => ({
  createEntryMock: vi.fn(async () => ({ id: 'entry-1' })),
}))

vi.mock('./api/vault-api', () => ({
  createEntry: createEntryMock,
}))

vi.mock('../../shared/crypto/vault-key', () => ({
  unsealVaultKey: vi.fn(async () => new Uint8Array(32)),
}))

vi.mock('../../shared/crypto/entry-crypto', () => ({
  encryptEntry: vi.fn(async () => ({ encryptedBlob: 'ENC', nonce: 'NCE' })),
}))

vi.mock('../../shared/crypto/sodium', () => ({
  wipe: vi.fn(),
}))

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { wrapper, invalidateSpy }
}

describe('useCreateEntry', () => {
  beforeEach(() => {
    createEntryMock.mockClear()
    useAuthStore.setState({ privateKey: new Uint8Array(32) })
  })

  it('invalidates the vault LIST key on success so entryCount refreshes', async () => {
    const { wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      label: 'Stripe',
      type: ENTRY_TYPE_KEY,
      payload: { type: ENTRY_TYPE_KEY, value: 'sk_live_1' },
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The dashboard onboarding step reads per-vault entryCount from the vault
    // list — it must be invalidated alongside the entries sub-key.
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(VAULTS_QUERY_KEY)
    expect(invalidatedKeys).toContainEqual(entriesQueryKey('vault-1'))
  })
})
