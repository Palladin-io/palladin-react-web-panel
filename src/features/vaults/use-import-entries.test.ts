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

const { importEntriesMock, updateEntryMock, fullGrantsMock, envelopeMock } = vi.hoisted(() => ({
  importEntriesMock: vi.fn(async (_vaultId: string, body: { entries: unknown[] }) => ({
    importedCount: body.entries.length,
    entryIds: body.entries.map((_, i) => `e${i}`),
  })),
  updateEntryMock: vi.fn(async () => undefined),
  fullGrantsMock: vi.fn(async () => [] as { grantId: string; agentPublicKey: string }[]),
  envelopeMock: vi.fn(async () => ({
    reEncryptedBlob: 'RE',
    nonce: 'GN',
    agentWrappedDek: 'DEK',
  })),
}))

vi.mock('./api/vault-api', () => ({
  importEntries: importEntriesMock,
  updateEntry: updateEntryMock,
}))

vi.mock('../grants', () => ({ collectActiveFullGrants: fullGrantsMock }))

vi.mock('../../shared/crypto/vault-key', () => ({
  unsealVaultKey: vi.fn(async () => new Uint8Array(32)),
}))

vi.mock('../../shared/crypto/entry-crypto', () => ({
  encryptEntry: vi.fn(async () => ({ encryptedBlob: 'ENC', nonce: 'NCE' })),
}))

vi.mock('../../shared/crypto/grant-envelope', () => ({
  produceGrantEntryEnvelope: envelopeMock,
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
    envelopeMock.mockClear()
    fullGrantsMock.mockReset()
    fullGrantsMock.mockResolvedValue([])
    useAuthStore.setState({ privateKey: new Uint8Array(32) })
  })

  it('chunks creates to 50 per request and sums the imported count', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    const creates = Array.from({ length: 120 }, (_, i) => credential(`Entry ${i}`))
    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      format: 'generic-csv',
      creates,
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(importEntriesMock).toHaveBeenCalledTimes(3)
    expect(importEntriesMock.mock.calls[0][1].entries).toHaveLength(50)
    expect(importEntriesMock.mock.calls[2][1].entries).toHaveLength(20)
    expect(result.current.data).toEqual({ importedCount: 120, updatedCount: 0, failed: [] })
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
    expect(result.current.data).toEqual({ importedCount: 1, updatedCount: 1, failed: [] })

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(VAULTS_QUERY_KEY)
    expect(keys).toContainEqual(entriesQueryKey('vault-1'))
  })

  it('reports a rejected entry as failed instead of dropping the batch', async () => {
    // The chunk is atomic on the server — bisection retries down to the single
    // offender and reports it with the reason, so no other entry is lost.
    importEntriesMock.mockRejectedValueOnce(new Error('label: too long'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      format: 'generic-csv',
      creates: [credential('GitHub')],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.importedCount).toBe(0)
    expect(result.current.data?.failed).toEqual([
      { label: 'GitHub', reason: 'label: too long' },
    ])
  })

  it('bisects a failed chunk so valid entries still import', async () => {
    // 2-item chunk: whole chunk 400s, then each half retries — one succeeds,
    // the other is reported as failed.
    importEntriesMock.mockRejectedValueOnce(new Error('bad item'))
    importEntriesMock.mockResolvedValueOnce({ importedCount: 1, entryIds: ['e1'] })
    importEntriesMock.mockRejectedValueOnce(new Error('bad item'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      format: 'generic-csv',
      creates: [credential('GitHub'), credential('GitLab')],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.importedCount).toBe(1)
    expect(result.current.data?.failed).toEqual([
      { label: 'GitLab', reason: 'bad item' },
    ])
  })

  it('re-wraps each created entry for every active FULL grant (keyed by grantId)', async () => {
    fullGrantsMock.mockResolvedValue([
      { grantId: 'g1', agentPublicKey: 'pk1' },
      { grantId: 'g2', agentPublicKey: 'pk2' },
    ])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      wrappedVK: 'WRAPPED',
      format: 'generic-csv',
      creates: [credential('GitHub'), credential('GitLab')],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // 2 entries × 2 grants = 4 envelope productions.
    expect(envelopeMock).toHaveBeenCalledTimes(4)
    const sentEntries = importEntriesMock.mock.calls[0][1].entries as Array<{
      grantEntries: { grantId: string; reEncryptedBlob: string }[]
    }>
    expect(sentEntries[0].grantEntries).toEqual([
      { grantId: 'g1', reEncryptedBlob: 'RE', nonce: 'GN', agentWrappedDek: 'DEK' },
      { grantId: 'g2', reEncryptedBlob: 'RE', nonce: 'GN', agentWrappedDek: 'DEK' },
    ])
  })
})
