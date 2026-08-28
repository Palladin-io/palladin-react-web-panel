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
  openMemberSecret: vi.fn(),
  buildEnvelope: vi.fn(),
  buildScriptPackage: vi.fn(),
  wipe: vi.fn(),
  privateKey: new Uint8Array(32),
}))

vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) } }))
vi.mock('../agents', () => ({ getAgent: mocks.getAgent }))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.openMemberSecret }))
vi.mock('../../shared/crypto/grant-protocol', () => ({ buildCanonicalGrantEnvelope: mocks.buildEnvelope }))
vi.mock('../../shared/crypto/vault-plaintext', () => ({ listGrantableFieldIds: vi.fn(() => ['key.value']) }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../vaults/script-execution-package', () => ({
  buildCompleteScriptExecutionPackage: mocks.buildScriptPackage,
}))
vi.mock('./api/pending-grants-api', () => ({ approveGrant: mocks.approve }))

import { useApproveGrant } from './use-approve-grant'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

describe('useApproveGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVault.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      memberVaultKey: {},
      memberKeyGeneration: 3,
    })
    mocks.getEntry.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      currentRevision: '7',
      state: 'active',
      entryKey: {},
      memberSecret: {},
    })
    mocks.getAgent.mockResolvedValue({
      publicKey: 'agent-public-key',
      recipientKeyVersion: 4,
      accessEpoch: 2,
    })
    mocks.buildScriptPackage.mockResolvedValue({
      contractVersion: 1,
      scriptRevision: '7',
      encodedPackageCiphertext: 'sealed-script-package',
    })
  })

  it('approves one ScriptExecution package with Exec only', async () => {
    const { result } = renderHook(() => useApproveGrant(), { wrapper })

    await result.current.mutateAsync({
      grantId: '33333333-3333-4333-8333-333333333333',
      vaultId: '22222222-2222-4222-8222-222222222222',
      entryId: '55555555-5555-4555-8555-555555555555',
      agentId: '44444444-4444-4444-8444-444444444444',
      type: 'scriptExecution',
      policy: { queryLimit: 3 },
      methods: ['exec'],
      fieldIds: [],
      reviewedEntryRevision: '7',
      requestedMethods: 2,
    })

    expect(mocks.buildScriptPackage).toHaveBeenCalledWith(expect.objectContaining({
      grantId: '33333333-3333-4333-8333-333333333333',
      scriptEntryId: '55555555-5555-4555-8555-555555555555',
      agentAccessEpoch: 2,
      recipientAgentKeyVersion: 4,
      packageRevision: '1',
    }))
    expect(mocks.approve).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        methods: 'Exec',
        queryLimit: 3,
        scriptPackage: expect.objectContaining({ encodedPackageCiphertext: 'sealed-script-package' }),
      }),
    )
    expect(mocks.approve.mock.calls[0][2].grantEntry).toBeUndefined()
    expect(mocks.openMemberSecret).not.toHaveBeenCalled()
    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalled()
  })
})
