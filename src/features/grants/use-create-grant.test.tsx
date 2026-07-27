import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  decrypt: vi.fn(async () => ({ schemaVersion: 1 })),
  produce: vi.fn(),
  wipe: vi.fn(),
  vaultState: { status: 'ready', entries: new Map() },
}))
vi.mock('./api/org-grants-api', async (original) => ({
  ...(await original<typeof import('./api/org-grants-api')>()),
  createGrantProactively: mocks.create,
}))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../vaults/sync/member-sync-store', () => ({ useMemberSyncStore: {
  getState: () => ({ vaults: new Map([['v1', mocks.vaultState]]) }),
} }))
vi.mock('../../shared/crypto/vault-v2-member-sync', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/vault-v2-entry', () => ({ decryptMemberSecret: mocks.decrypt }))
vi.mock('../../shared/crypto/grant-envelope', () => ({ produceGrantEntryEnvelope: mocks.produce }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: new Uint8Array(32) }) } }))

import { useCreateGrant } from './use-create-grant'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

describe('useCreateGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vaultState.status = 'ready'
    mocks.vaultState.entries = new Map()
    mocks.create.mockResolvedValue({ id: 'new' })
    mocks.getVault.mockResolvedValue({
      memberVaultKey: { organizationId: 'org', memberId: 'member' },
      memberKeyGeneration: 3,
      currentKeyEpoch: { vaultKeyVersion: 2 },
    })
    mocks.getEntry.mockImplementation(async (_vaultId: string, entryId: string) => ({
      organizationId: 'org', id: entryId, currentRevision: '7',
    }))
    mocks.produce.mockImplementation(async ({ scope }: { scope: { entryId: string } }) => ({
      grantId: scope.entryId, entryId: scope.entryId,
    }))
  })

  it('creates one exact-revision GRANULAR envelope with a client-owned Grant id', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      type: 'granular', entryId: 'e1', policy: { queryLimit: 3 }, methods: ['exec', 'inject'],
    })
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    const [, body] = mocks.create.mock.calls[0]
    expect(body.grantId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.entryId).toBe('e1')
    expect(body.methods).toBe('Exec, Inject')
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({ entryRevision: '7', grantEnvelopeRevision: '1',
        grantKeyVersion: 1, memberKeyGeneration: 3, recipientAgentKeyVersion: 4,
        approvedMethods: 6, remainingUses: 3 }),
    }))
    expect(mocks.wipe).toHaveBeenCalled()
  })

  it('processes every active FULL entry sequentially and excludes archived entries', async () => {
    mocks.vaultState.entries = new Map([
      ['e1', { entryId: 'e1', state: 'active', corrupt: false }],
      ['e2', { entryId: 'e2', state: 'archived', corrupt: false }],
      ['e3', { entryId: 'e3', state: 'active', corrupt: false }],
    ])
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      type: 'full', policy: {}, methods: ['get'],
    })
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.getEntry.mock.calls.map((call) => call[1])).toEqual(['e1', 'e3'])
    expect(mocks.produce).toHaveBeenCalledTimes(2)
    expect(mocks.create.mock.calls[0][1].entryId).toBeUndefined()
  })

  it('fails before opening keys when recipient identity metadata is missing', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: null,
      type: 'granular', entryId: 'e1', policy: {}, methods: ['exec'],
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
