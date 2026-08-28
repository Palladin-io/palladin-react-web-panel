import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  getAgent: vi.fn(),
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  openSecret: vi.fn(async () => ({ schemaVersion: 1, entryType: 'credential' })),
  buildEnvelope: vi.fn(),
  listFields: vi.fn(() => ['credential.password', 'credential.username']),
  wipe: vi.fn(),
  privateKey: new Uint8Array(32),
}))

vi.mock('./api/pending-grants-api', async (original) => ({
  ...(await original<typeof import('./api/pending-grants-api')>()),
  approveGrant: mocks.approve,
}))
vi.mock('../agents', () => ({ getAgent: mocks.getAgent }))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.openSecret }))
vi.mock('../../shared/crypto/grant-protocol', () => ({ buildCanonicalGrantEnvelope: mocks.buildEnvelope }))
vi.mock('../../shared/crypto/vault-plaintext', () => ({ listGrantableFieldIds: mocks.listFields }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) } }))

import { MissingGrantMaterialError, useApproveGrant } from './use-approve-grant'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

const input = {
  grantId: '77777777-7777-4777-8777-777777777777',
  vaultId: '22222222-2222-4222-8222-222222222222',
  entryId: '33333333-3333-4333-8333-333333333333',
  agentId: '55555555-5555-4555-8555-555555555555',
  policy: { queryLimit: 3 } as const,
  methods: ['get', 'inject'] as const,
  fieldIds: ['credential.username', 'credential.password'],
  reviewedEntryRevision: '7',
  requestedMethods: 5,
}

describe('useApproveGrant contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVault.mockResolvedValue({ memberVaultKey: {}, memberKeyGeneration: 4 })
    mocks.getEntry.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      currentRevision: '7',
      state: 'active',
      entryKey: {},
      memberSecret: {},
    })
    mocks.getAgent.mockResolvedValue({ publicKey: 'agent-public-key', recipientKeyVersion: 3 })
    mocks.buildEnvelope.mockResolvedValue({ descriptor: { purpose: 'grantPayload' } })
    mocks.approve.mockResolvedValue(undefined)
  })

  it('approves the exact reviewed GRANULAR scope using the current producer contract', async () => {
    const { result } = renderHook(() => useApproveGrant(), { wrapper })

    await result.current.mutateAsync({ ...input, methods: [...input.methods] })

    expect(mocks.buildEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      grantId: input.grantId,
      entryRevision: '7',
      memberKeyGeneration: 4,
      recipientKeyVersion: 3,
      approvedMethods: 5,
      approvedFieldIds: ['credential.password', 'credential.username'],
      remainingUses: 3,
    }))
    expect(mocks.approve).toHaveBeenCalledWith(input.vaultId, input.grantId, {
      grantEntry: { descriptor: { purpose: 'grantPayload' } },
      queryLimit: 3,
      methods: 'Get, Inject',
    })
    expect(mocks.getEntry).toHaveBeenCalledTimes(2)
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing reviewed field', ['credential.password']],
    ['broadened reviewed field', ['credential.password', 'credential.username', 'credential.url']],
    ['duplicate reviewed field', ['credential.password', 'credential.password']],
  ])('rejects %s instead of silently changing the approved field contract', async (_name, fieldIds) => {
    const { result } = renderHook(() => useApproveGrant(), { wrapper })

    await expect(result.current.mutateAsync({
      ...input,
      methods: [...input.methods],
      fieldIds,
    })).rejects.toBeInstanceOf(MissingGrantMaterialError)

    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })

  it('rejects methods outside the authenticated request before opening key material', async () => {
    const { result } = renderHook(() => useApproveGrant(), { wrapper })

    await expect(result.current.mutateAsync({
      ...input,
      methods: ['get', 'inject'],
      requestedMethods: 1,
    })).rejects.toBeInstanceOf(MissingGrantMaterialError)

    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
  })
})
