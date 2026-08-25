import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useRegrant } from './use-regrant'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getAgent: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  buildFull: vi.fn(),
  wipe: vi.fn(),
}))

vi.mock('./api/org-grants-api', async (original) => ({
  ...(await original<typeof import('./api/org-grants-api')>()),
  createGrantProactively: mocks.create,
}))
vi.mock('../agents', () => ({ getAgent: mocks.getAgent }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/x25519-wrapper', () => ({ buildAgentWrappedVaultKey: mocks.buildFull }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: vi.fn() }))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: vi.fn() }))
vi.mock('../../shared/crypto/grant-protocol', () => ({ buildCanonicalGrantEnvelope: vi.fn() }))
vi.mock('../../shared/crypto/vault-plaintext', () => ({ listGrantableFieldIds: vi.fn() }))

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

const input = {
  vaultId: '11111111-1111-4111-8111-111111111111',
  agentId: '22222222-2222-4222-8222-222222222222',
  type: 'full' as const,
  policy: {},
  methods: 'Get',
}

describe('useRegrant unlock-session fencing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
    mocks.getVault.mockResolvedValue({
      organizationId: '33333333-3333-4333-8333-333333333333',
      memberVaultKey: {},
      currentKeyEpoch: { vaultKeyVersion: 2 },
    })
    mocks.getAgent.mockResolvedValue({
      publicKey: 'agent-public-key', recipientKeyVersion: 3, accessEpoch: 4,
    })
    mocks.buildFull.mockResolvedValue({ wrappedVaultKey: {} })
    mocks.create.mockResolvedValue({ id: 'grant' })
  })

  it('does not open the Vault key after the unlock session changes during fetch', async () => {
    mocks.getAgent.mockImplementationOnce(async () => {
      useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) })
      return { publicKey: 'agent-public-key', recipientKeyVersion: 3, accessEpoch: 4 }
    })
    const { result } = renderHook(() => useRegrant(), { wrapper })

    await expect(result.current.mutateAsync(input)).rejects.toThrow('Vault is locked')
    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('does not submit a wrapper prepared by a replaced unlock session', async () => {
    mocks.buildFull.mockImplementationOnce(async () => {
      useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) })
      return { wrappedVaultKey: {} }
    })
    const { result } = renderHook(() => useRegrant(), { wrapper })

    await expect(result.current.mutateAsync(input)).rejects.toThrow('Vault is locked')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })
})
