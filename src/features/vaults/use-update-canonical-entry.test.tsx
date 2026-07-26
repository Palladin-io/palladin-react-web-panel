import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { ENTRY_TYPE_KEY } from './types'
import {
  ActiveGrantRefreshRequiredError,
  useUpdateCanonicalEntry,
} from './use-update-canonical-entry'

const mocks = vi.hoisted(() => ({
  getGrants: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32).fill(1)),
  openDiscoveryKey: vi.fn(async () => new Uint8Array(32).fill(2)),
  createMaterial: vi.fn(async () => ({ baseRevision: '1', memberSecret: { ciphertext: 'secret' },
    agentDiscoveryChanged: false, grantEnvelopes: [] })),
  update: vi.fn(async () => ({ currentRevision: '2' })),
  wipe: vi.fn(),
}))

vi.mock('../grants', () => ({ GRANT_STATUS_ACTIVE: 'active', GRANT_TYPE_FULL: 'full', getOrgGrants: mocks.getGrants }))
vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-v2-member-sync', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/vault-v2-rotation', () => ({ openDiscoveryKey: mocks.openDiscoveryKey }))
vi.mock('../../shared/crypto/vault-v2-entry', () => ({ createEntryUpdateMaterial: mocks.createMaterial }))
vi.mock('./api/vault-api', () => ({ updateCanonicalEntry: mocks.update }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }) }, children)
}

const input = {
  detail: { organizationId: 'org', vaultId: 'vault', id: 'entry', currentRevision: '1' },
  previous: { schemaVersion: 1 as const, memberLabel: 'Old', agentLabel: 'Agent', entryType: ENTRY_TYPE_KEY,
    content: { type: ENTRY_TYPE_KEY, value: 'secret' }, agentVisibilityPolicy: { discoverable: true, fields: {} } },
  draft: { memberLabel: 'New', agentLabel: 'Agent', entryType: ENTRY_TYPE_KEY,
    content: { type: ENTRY_TYPE_KEY, value: 'secret' }, policy: { discoverable: true, fields: {} } },
}

describe('useUpdateCanonicalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
    mocks.getGrants.mockResolvedValue({ items: [], nextCursor: null })
    mocks.getVault.mockResolvedValue({ memberVaultKey: { memberId: 'member' }, memberKeyGeneration: 1,
      currentKeyEpoch: { vaultKeyVersion: 1, vdkVersion: 1 }, discoveryKey: {} })
  })

  it('fails before opening keys or writing when a covering grant needs an atomic refresh', async () => {
    mocks.getGrants.mockResolvedValue({ items: [{ id: 'grant', type: 'full' }], nextCursor: null })
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(input as never)
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ActiveGrantRefreshRequiredError))
    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.createMaterial).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('submits only canonical ciphertext material and wipes opened keys', async () => {
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(input as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.update).toHaveBeenCalledWith('vault', 'entry', {
      baseRevision: '1', memberSecret: { ciphertext: 'secret' }, agentDiscoveryChanged: false, grantEnvelopes: [],
    })
    expect(mocks.update.mock.calls[0][2]).not.toHaveProperty('draft')
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })
})
