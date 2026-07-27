import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useMemberSyncStore } from './sync/member-sync-store'
import { useCreateVault, VaultLockedError } from './use-create-vault'

const mocks = vi.hoisted(() => ({
  createVault: vi.fn(),
  issueChallenge: vi.fn(),
  getAccount: vi.fn(),
  listVaults: vi.fn(),
  createMaterial: vi.fn(),
}))

vi.mock('./api/vault-api', () => ({
  createVault: mocks.createVault,
  issueVaultCreationChallenge: mocks.issueChallenge,
}))
vi.mock('../../shared/api/account-api', () => ({ getAccount: mocks.getAccount }))
vi.mock('./sync/member-sync-api', () => ({ listEncryptedVaults: mocks.listVaults }))
vi.mock('../../shared/crypto/create-vault-protocol', () => ({
  createVaultProtocolPayload: mocks.createMaterial,
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const memberId = '22222222-2222-4222-8222-222222222222'
const firstVaultId = '33333333-3333-4333-8333-333333333333'
const secondVaultId = '44444444-4444-4444-8444-444444444444'

function token(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload)).replaceAll('=', '')}.signature`
}

function material(vaultId: string) {
  return {
    vaultId,
    memberVaultMetadata: { ciphertext: 'metadata' },
    currentKeyEpoch: {
      vaultKeyVersion: 1,
      vdkVersion: 1,
      agentMessageKeyVersion: 1,
      manifestSigningKeyVersion: 1,
    },
    creatorVaultKey: { sealedVaultKeyPackage: 'vault-key' },
    discoveryKey: { ciphertext: 'discovery-key' },
    vaultPrivateKeys: [{ ciphertext: 'private-key-1' }, { ciphertext: 'private-key-2' }],
  }
}

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

describe('useCreateVault', () => {
  let client: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    useAuthStore.getState().logout()
    useMemberSyncStore.getState().clear()
    mocks.getAccount.mockResolvedValue({ memberKeyVersion: 7 })
    mocks.issueChallenge.mockResolvedValue({ vaultId: firstVaultId, expiresAt: '2026-07-26T12:00:00Z' })
    mocks.listVaults.mockResolvedValue([])
    mocks.createMaterial.mockImplementation(async ({ vaultId }) => material(vaultId))
    mocks.createVault.mockResolvedValue(undefined)
  })

  function unlock() {
    useAuthStore.setState({
      accessToken: token({ org_id: organizationId }),
      userId: memberId,
      privateKey: new Uint8Array(32).fill(9),
      isVaultLocked: false,
    })
  }

  it('fails closed before any API call while locked', async () => {
    const { result } = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })

    await expect(act(() => result.current.mutateAsync({ name: 'Production' })))
      .rejects.toBeInstanceOf(VaultLockedError)
    expect(mocks.issueChallenge).not.toHaveBeenCalled()
    expect(mocks.createVault).not.toHaveBeenCalled()
  })

  it('uses the server-authoritative Member key version and sends only encrypted material', async () => {
    unlock()
    const { result } = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })

    await act(() => result.current.mutateAsync({
      name: 'Productio\u0301n', description: 'Primary', icon: 'shield', color: '#EB4747',
    }))

    expect(mocks.createMaterial).toHaveBeenCalledWith({
      organizationId,
      vaultId: firstVaultId,
      memberId,
      memberKeyVersion: 7,
      memberPrivateKey: expect.any(Uint8Array),
      metadata: {
        schema: 'palladin.member-vault-metadata.v1',
        name: 'Productión', description: 'Primary',
        icon: { kind: 'glyph', value: 'shield' }, color: '#EB4747', grantMode: 'granular',
      },
    })
    expect(mocks.createVault).toHaveBeenCalledWith(material(firstVaultId))
    expect(mocks.createVault.mock.calls[0][0]).not.toHaveProperty('name')
  })

  it('retries the exact ciphertext when the server reissues the same challenge', async () => {
    unlock()
    const transient = new TypeError('response lost')
    mocks.createVault.mockRejectedValueOnce(transient).mockResolvedValueOnce(undefined)
    mocks.listVaults.mockRejectedValueOnce(new TypeError('offline'))
    const { result } = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })

    await expect(act(() => result.current.mutateAsync({ name: 'Production' }))).rejects.toBe(transient)
    await act(() => result.current.mutateAsync({ name: 'Production' }))

    expect(mocks.createMaterial).toHaveBeenCalledTimes(1)
    expect(mocks.createVault.mock.calls[1][0]).toEqual(mocks.createVault.mock.calls[0][0])
  })

  it('preserves an ambiguous attempt across remounts and ignores edited retry input', async () => {
    unlock()
    const transient = new TypeError('response lost')
    mocks.createVault.mockRejectedValueOnce(transient).mockResolvedValueOnce(undefined)
    mocks.listVaults.mockRejectedValueOnce(new TypeError('offline'))
    const first = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })

    await expect(act(() => first.result.current.mutateAsync({ name: 'Production' })))
      .rejects.toBe(transient)
    first.unmount()

    const second = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })
    expect(second.result.current.pendingInput).toEqual({ name: 'Production' })
    await act(() => second.result.current.mutateAsync({ name: 'Edited after ambiguity' }))

    expect(mocks.createMaterial).toHaveBeenCalledTimes(1)
    expect(mocks.createVault.mock.calls[1][0]).toEqual(mocks.createVault.mock.calls[0][0])
  })

  it('reconciles a consumed challenge without creating a duplicate Vault', async () => {
    unlock()
    mocks.createVault.mockRejectedValueOnce(new TypeError('response lost'))
    mocks.listVaults.mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce([{ id: firstVaultId }])
    mocks.issueChallenge.mockResolvedValueOnce({ vaultId: firstVaultId })
      .mockResolvedValueOnce({ vaultId: secondVaultId })
    const { result } = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })

    await expect(act(() => result.current.mutateAsync({ name: 'Production' }))).rejects.toThrow('response lost')
    const reconciled = await act(() => result.current.mutateAsync({ name: 'Production' }))

    expect(reconciled).toEqual({ vaultId: firstVaultId })
    expect(mocks.createMaterial).toHaveBeenCalledTimes(1)
    expect(mocks.createVault).toHaveBeenCalledTimes(1)
  })

  it('triggers normal encrypted sync after a successful create', async () => {
    unlock()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const retryGeneration = useMemberSyncStore.getState().retryGeneration
    const { result } = renderHook(() => useCreateVault(), { wrapper: wrapperWith(client) })

    await act(() => result.current.mutateAsync({ name: 'Production' }))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vaults'] })
    expect(useMemberSyncStore.getState().retryGeneration).toBe(retryGeneration + 1)
  })
})
