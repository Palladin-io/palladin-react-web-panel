import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useCreateEntry } from './use-create-entry'
import { ENTRY_TYPE_KEY } from './types'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { entriesQueryKey } from './use-entries'

const { createEntryMock, challengeMock } = vi.hoisted(() => ({
  createEntryMock: vi.fn(async () => ({ id: 'entry-1' })),
  challengeMock: vi.fn(async () => ({ items: [{ entryId: 'entry-1', expiresAt: '' }] })),
}))

vi.mock('./api/vault-api', () => ({
  createEntry: createEntryMock,
  issueEntryCreationChallenge: challengeMock,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({
  sealCanonicalEntry: vi.fn(async () => ({ entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null })),
}))

vi.mock('../../shared/crypto/sodium', () => ({
  wipe: vi.fn(),
}))

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  client.setQueryData(['vaults', 'vault-1'], { id: 'vault-1', organizationId: 'org-1', memberKeyGeneration: 1, currentKeyEpoch: { vaultKeyVersion: 1, vdkVersion: 1 } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { wrapper, invalidateSpy }
}

describe('useCreateEntry', () => {
  beforeEach(() => {
    createEntryMock.mockClear()
    useAuthStore.setState({ privateKey: new Uint8Array(32), vaultKeys: { 'vault-1': new Uint8Array(32) }, vaultDiscoveryKeys: { 'vault-1': new Uint8Array(32) } })
  })

  it('invalidates the vault LIST key on success so entryCount refreshes', async () => {
    const { wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
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
