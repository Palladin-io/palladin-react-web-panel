import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from './types'
import type { ParsedEntry } from './import'
import { useImportEntries } from './use-import-entries'
import { entriesQueryKey } from './use-entries'
import { VAULTS_QUERY_KEY } from './use-vaults'

const { importEntriesMock, updateEntryMock } = vi.hoisted(() => ({
  importEntriesMock: vi.fn(async (_vaultId: string, body: { entries: unknown[] }) => ({
    importedCount: body.entries.length,
    entryIds: body.entries.map((_, i) => `e${i}`),
  })),
  updateEntryMock: vi.fn(async () => undefined),
}))

vi.mock('./api/vault-api', () => ({
  importEntries: importEntriesMock,
  updateEntry: updateEntryMock,
}))

vi.mock('../../shared/crypto/vault-key', () => ({
  unsealVaultKey: vi.fn(async () => new Uint8Array(32)),
}))

vi.mock('../../shared/crypto/entry-crypto', () => ({
  encryptEntry: vi.fn(async () => ({ encryptedBlob: 'ENC', nonce: 'NCE' })),
}))

vi.mock('../../shared/crypto/sodium', () => ({ wipe: vi.fn() }))

function credential(label: string): ParsedEntry {
  return { label, type: ENTRY_TYPE_CREDENTIAL, username: 'u', password: 'p' }
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { wrapper, invalidateSpy }
}

describe('useImportEntries', () => {
  beforeEach(() => {
    importEntriesMock.mockClear()
    updateEntryMock.mockClear()
    useAuthStore.setState({ privateKey: new Uint8Array(32) })
  })

  it('chunks creates to 500 per request and sums the imported count', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    const creates = Array.from({ length: 600 }, (_, i) => credential(`Entry ${i}`))
    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      format: 'generic-csv',
      creates,
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(importEntriesMock).toHaveBeenCalledTimes(2)
    expect(importEntriesMock.mock.calls[0][1].entries).toHaveLength(500)
    expect(importEntriesMock.mock.calls[1][1].entries).toHaveLength(100)
    expect(result.current.data).toEqual({ importedCount: 600, updatedCount: 0 })
  })

  it('sends overwrites as individual updates and invalidates list keys', async () => {
    const { wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      format: 'palladin-json',
      creates: [{ label: 'Token', type: ENTRY_TYPE_KEY, value: 'sk_1' }],
      overwrites: [{ entryId: 'old-1', entry: credential('GitHub') }],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(updateEntryMock).toHaveBeenCalledTimes(1)
    expect(updateEntryMock.mock.calls[0][0]).toBe('vault-1')
    expect(result.current.data).toEqual({ importedCount: 1, updatedCount: 1 })

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(VAULTS_QUERY_KEY)
    expect(keys).toContainEqual(entriesQueryKey('vault-1'))
  })
})
