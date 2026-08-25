import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getAgent: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  buildScriptPackage: vi.fn(),
  wipe: vi.fn(),
  privateKey: new Uint8Array(32),
}))

vi.mock('./api/org-grants-api', async (original) => ({
  ...(await original<typeof import('./api/org-grants-api')>()),
  createGrantProactively: mocks.create,
}))
vi.mock('../agents', () => ({ getAgent: mocks.getAgent }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openVaultKey,
  openVaultDerivedEnvelope: vi.fn(),
}))
vi.mock('../vaults/script-execution-package', () => ({
  buildCompleteScriptExecutionPackage: mocks.buildScriptPackage,
}))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) } }))

import { useRegrant } from './use-regrant'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

describe('useRegrant Script revision boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVault.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      memberVaultKey: {},
    })
    mocks.getAgent.mockResolvedValue({
      publicKey: 'agent-public-key',
      recipientKeyVersion: 4,
      accessEpoch: 2,
    })
  })

  it('does not regrant when the Script changed after the member reviewed it', async () => {
    mocks.buildScriptPackage.mockResolvedValue({ scriptRevision: '10', encodedPackageCiphertext: 'sealed' })
    const { result } = renderHook(() => useRegrant(), { wrapper })

    await expect(result.current.mutateAsync({
      vaultId: 'v1',
      agentId: 'a1',
      entryId: 'script-1',
      reviewedScriptRevision: '9',
      type: 'scriptExecution',
      policy: {},
      methods: 'Exec',
    })).rejects.toThrow('Cannot produce a revision-bound grant envelope')

    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalled()
  })
})
