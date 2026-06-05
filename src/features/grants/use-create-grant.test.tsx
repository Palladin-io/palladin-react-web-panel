import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- mocks ---
const createGrantProactively = vi.hoisted(() => vi.fn())
vi.mock('./api/org-grants-api', async (orig) => {
  const actual = await orig<typeof import('./api/org-grants-api')>()
  return { ...actual, createGrantProactively }
})

const getVault = vi.hoisted(() => vi.fn())
const getEntries = vi.hoisted(() => vi.fn())
const getEntry = vi.hoisted(() => vi.fn())
vi.mock('../vaults/api/vault-api', () => ({ getVault, getEntries, getEntry }))

const produceGrantEntryEnvelope = vi.hoisted(() => vi.fn())
vi.mock('../../shared/crypto/grant-envelope', () => ({ produceGrantEntryEnvelope }))
vi.mock('../../shared/crypto/vault-key', () => ({
  unsealVaultKey: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
}))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: vi.fn() }))

vi.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ privateKey: new Uint8Array([9]) }) },
}))

import { useCreateGrant } from './use-create-grant'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const ENVELOPE = { reEncryptedBlob: 'b', nonce: 'n', agentWrappedDek: 'd' }

describe('useCreateGrant', () => {
  beforeEach(() => {
    createGrantProactively.mockReset().mockResolvedValue({ id: 'new' })
    getVault.mockReset().mockResolvedValue({ id: 'v1', wrappedVK: 'wrapped' })
    getEntries.mockReset()
    getEntry.mockReset().mockResolvedValue({ content: { encryptedBlob: 'x', nonce: 'y' } })
    produceGrantEntryEnvelope.mockReset().mockResolvedValue(ENVELOPE)
  })

  it('GRANULAR: one envelope, body carries entryId', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1',
      agentId: 'a1',
      agentPublicKey: 'PK',
      type: 'granular',
      entryId: 'e1',
      policy: { queryLimit: 3 },
    })
    await waitFor(() => expect(createGrantProactively).toHaveBeenCalled())
    const [vaultId, body] = createGrantProactively.mock.calls[0]
    expect(vaultId).toBe('v1')
    expect(body.type).toBe('granular')
    expect(body.entryId).toBe('e1')
    expect(body.grantEntries).toEqual([{ entryId: 'e1', ...ENVELOPE }])
    expect(body.queryLimit).toBe(3)
    expect(getEntries).not.toHaveBeenCalled()
  })

  it('FULL: envelope per vault entry, body omits entryId', async () => {
    getEntries.mockResolvedValue({ items: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] })
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1',
      agentId: 'a1',
      agentPublicKey: 'PK',
      type: 'full',
      policy: {},
    })
    await waitFor(() => expect(createGrantProactively).toHaveBeenCalled())
    const [, body] = createGrantProactively.mock.calls[0]
    expect(body.type).toBe('full')
    expect(body.entryId).toBeUndefined()
    expect(body.grantEntries).toHaveLength(3)
    expect(body.grantEntries.map((e: { entryId: string }) => e.entryId)).toEqual([
      'e1',
      'e2',
      'e3',
    ])
    expect(produceGrantEntryEnvelope).toHaveBeenCalledTimes(3)
  })

  it('errors when the agent public key is missing', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1',
      agentId: 'a1',
      agentPublicKey: null,
      type: 'granular',
      entryId: 'e1',
      policy: {},
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(createGrantProactively).not.toHaveBeenCalled()
  })
})
