import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useDeleteEntry } from './use-delete-entry'

const mocks = vi.hoisted(() => ({
  getVault: vi.fn(),
  getEntry: vi.fn(),
  deleteEntry: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32).fill(7)),
  openDiscoveryKey: vi.fn(async () => new Uint8Array(32).fill(8)),
  decrypt: vi.fn(),
  createMaterial: vi.fn(),
  wipe: vi.fn(),
  retry: vi.fn(),
  reconcile: vi.fn(),
}))

vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('./api/vault-api', () => ({
  getCanonicalEntry: mocks.getEntry,
  deleteEntry: mocks.deleteEntry,
}))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openVaultKey, openVaultDerivedEnvelope: mocks.openDiscoveryKey,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({
  openMemberSecret: mocks.decrypt, sealCanonicalEntry: mocks.createMaterial,
}))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('./sync/member-sync-store', () => ({
  useMemberSyncStore: {
    getState: () => ({ vaults: new Map([['vault', { entries: new Map([['entry', { entryId: 'entry', state: 'active', memberIndexRevision: '3' }]]) }]]), retry: mocks.retry, reconcileEntry: mocks.reconcile }),
  },
}))

const vault = {
  memberKeyGeneration: 2,
  currentKeyEpoch: { vaultKeyVersion: 4, vdkVersion: 3 },
  memberVaultKey: {},
  discoveryKey: { opaque: 'discovery-key' },
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })
  return createElement(QueryClientProvider, { client }, children)
}

describe('useDeleteEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(5) })
    mocks.getVault.mockResolvedValue(vault)
    mocks.getEntry.mockResolvedValue({
      organizationId: 'org', currentRevision: '7', currentKeyVersion: 2,
      memberIndexRevision: '3', entryKey: { descriptor: { resourceRevision: '2' } }, memberSecret: {},
    })
    mocks.decrypt.mockResolvedValue({ memberLabel: 'preserved secret' })
    mocks.createMaterial.mockResolvedValue({
      entryKey: { descriptor: { keyVersion: 3 } },
      memberIndex: { descriptor: { resourceRevision: '4' } },
      memberSecret: { encrypted: true }, agentDiscovery: { mustNotBeSent: true },
    })
    mocks.deleteEntry.mockResolvedValue({ state: 'deleted', currentRevision: '8' })
  })

  it('seals the next deleted revision, omits Discovery, and reconciles the list after commit', async () => {
    const { result } = renderHook(() => useDeleteEntry('vault'), { wrapper })
    await act(async () => { await result.current.mutateAsync('entry') })
    expect(mocks.decrypt).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(Uint8Array), {
      organizationId: 'org', vaultId: 'vault', entryId: 'entry', revision: '7',
    })
    expect(mocks.createMaterial).toHaveBeenCalledWith(expect.objectContaining({
      revision: '8', entryKeyRevision: '3', entryKeyVersion: 3, memberIndexRevision: '4',
    }), { memberLabel: 'preserved secret' }, expect.any(Uint8Array), expect.any(Uint8Array), 5)
    expect(mocks.deleteEntry).toHaveBeenCalledWith('vault', 'entry', {
      baseRevision: '7', newEntryKey: { descriptor: { keyVersion: 3 } },
      memberIndex: { descriptor: { resourceRevision: '4' } }, memberSecret: { encrypted: true },
    })
    expect(mocks.reconcile).toHaveBeenCalledWith('vault', expect.objectContaining({
      entryId: 'entry', state: 'deleted', currentRevision: '8', memberIndexRevision: '4',
    }))
    expect(mocks.retry).toHaveBeenCalledOnce()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('does not remove the Entry locally when the server rejects the deletion', async () => {
    mocks.deleteEntry.mockRejectedValueOnce(new Error('conflict'))
    const { result } = renderHook(() => useDeleteEntry('vault'), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync('entry')).rejects.toThrow('conflict') })
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(mocks.retry).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('never posts ciphertext prepared during a replaced unlock session', async () => {
    let release: (() => void) | undefined
    mocks.createMaterial.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ entryKey: {}, memberIndex: {}, memberSecret: {} })
    }))
    const { result } = renderHook(() => useDeleteEntry('vault'), { wrapper })
    let mutation: Promise<unknown>
    act(() => { mutation = result.current.mutateAsync('entry').catch((error: unknown) => error) })
    await waitFor(() => expect(release).toBeTypeOf('function'))
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) })
    let error: unknown
    await act(async () => { release!(); error = await mutation! })
    expect(error).toBeInstanceOf(Error)
    expect(mocks.deleteEntry).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })
})
