import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useRestoreArchivedEntries } from './use-restore-archived-entries'

const mocks = vi.hoisted(() => ({
  getVault: vi.fn(),
  getEntry: vi.fn(),
  restoreEntry: vi.fn(),
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
  restoreCanonicalEntry: mocks.restoreEntry,
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
    getState: () => ({ vaults: new Map(), retry: mocks.retry, reconcileEntry: mocks.reconcile }),
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

describe('useRestoreArchivedEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(5) })
    mocks.getVault.mockResolvedValue(vault)
    mocks.getEntry.mockImplementation(async (_vaultId: string, entryId: string) => ({ id: entryId,
      organizationId: 'org', vaultId: 'vault', state: 'archived', currentRevision: '1',
      memberIndexRevision: '1', agentDiscoveryRevisionHighWatermark: '0', currentKeyVersion: 1,
      entryKey: { descriptor: { resourceRevision: '1' } }, memberSecret: {} }))
    mocks.decrypt.mockImplementation(async (entryKey: { descriptor: { resourceRevision: string } }) => ({ memberLabel: entryKey.descriptor.resourceRevision }))
    mocks.createMaterial.mockImplementation(async () => ({
      entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null,
    }))
    mocks.restoreEntry.mockResolvedValue({ state: 'active', currentRevision: '2' })
  })

  it('deduplicates and restores Entries sequentially while continuing after an isolated failure', async () => {
    let active = 0
    let maximumActive = 0
    mocks.createMaterial.mockImplementation(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      return { entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null }
    })
    mocks.restoreEntry.mockImplementation(async (_vaultId: string, entryId: string) => {
      if (entryId === 'entry-b') throw new Error('conflict')
      return { state: 'active', currentRevision: '2' }
    })

    const { result } = renderHook(() => useRestoreArchivedEntries('vault'), { wrapper })
    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined
    await act(async () => { response = await result.current.mutateAsync(['entry-a', 'entry-b', 'entry-a', 'entry-c']) })

    expect(response).toEqual({ restored: ['entry-a', 'entry-c'], failed: ['entry-b'] })
    expect(mocks.getEntry.mock.calls.map((call) => call[1])).toEqual(['entry-a', 'entry-b', 'entry-c'])
    expect(mocks.restoreEntry.mock.calls.map((call) => call[1])).toEqual(['entry-a', 'entry-b', 'entry-c'])
    expect(maximumActive).toBe(1)
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('never posts material prepared by a crypto session invalidated by lock and re-unlock', async () => {
    let releaseMaterial: (() => void) | undefined
    mocks.createMaterial.mockImplementation(() => new Promise((resolve) => {
      releaseMaterial = () => resolve({ entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null })
    }))

    const { result } = renderHook(() => useRestoreArchivedEntries('vault'), { wrapper })
    let mutation: Promise<unknown>
    act(() => { mutation = result.current.mutateAsync(['entry-a', 'entry-b']) })
    await waitFor(() => expect(releaseMaterial).toBeTypeOf('function'))
    act(() => {
      useAuthStore.getState().lockVault()
      useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), new Uint8Array(32).fill(9))
      releaseMaterial!()
    })
    let response: unknown
    await act(async () => { response = await mutation! })

    expect(mocks.restoreEntry).not.toHaveBeenCalled()
    expect(response).toEqual({ restored: [], failed: ['entry-a', 'entry-b'] })
    // Vault + Discovery keys are wiped; lockVault also wipes the auth key.
    expect(mocks.wipe.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
