import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { defaultAgentVisibilityPolicy } from '../../shared/crypto/entry-draft'
import { useCreateEntry, VaultLockedError } from './use-create-entry'
import { ENTRY_TYPE_KEY } from './types'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { entriesQueryKey } from './use-entries'

const mocks = vi.hoisted(() => ({
  createEntry: vi.fn(async () => ({ id: 'entry-1', currentRevision: '1' })),
  updateEntry: vi.fn(async () => undefined),
  uploadIcon: vi.fn(async () => ({ assetId: '33333333-4455-4677-8899-aabbccddeeff', iconReference: 'asset:33333333-4455-4677-8899-aabbccddeeff' })),
  deleteIcon: vi.fn(async () => undefined),
  issueChallenge: vi.fn(async () => ({ entryId: '22222233-4455-4677-8899-aabbccddeeff', expiresAt: '2026-08-01T00:00:00Z' })),
  getVault: vi.fn(),
  collectGrants: vi.fn(async () => []),
  openVaultKey: vi.fn(async () => new Uint8Array(32).fill(7)),
  openDiscoveryKey: vi.fn(async () => new Uint8Array(32).fill(9)),
  createMaterial: vi.fn(async () => ({
    entryKey: { opaque: 'entry-key' },
    memberIndex: { opaque: 'member-index' },
    memberSecret: { opaque: 'member-secret' },
    agentDiscovery: { opaque: 'agent-discovery' },
  })),
  wipe: vi.fn(),
}))

vi.mock('./api/vault-api', () => ({
  createEntry: mocks.createEntry,
  updateCanonicalEntry: mocks.updateEntry,
  issueEntryCreationChallenge: mocks.issueChallenge,
}))
vi.mock('./assets/encrypted-asset-service', () => ({ encryptAndUploadPresentationAsset: mocks.uploadIcon }))
vi.mock('./assets/encrypted-asset-api', () => ({ deleteEncryptedAsset: mocks.deleteIcon }))
vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../grants', () => ({ collectActiveFullGrants: mocks.collectGrants }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openVaultKey, openVaultDerivedEnvelope: mocks.openDiscoveryKey,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({ sealCanonicalEntry: mocks.createMaterial }))
vi.mock('../../shared/crypto/entry-draft', async (original) => ({
  ...(await original<typeof import('../../shared/crypto/entry-draft')>()),
  toMemberSecret: (value: unknown) => value,
}))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))

const vault = {
  id: '11112233-4455-4677-8899-aabbccddeeff',
  memberKeyGeneration: 2,
  currentKeyEpoch: { vaultKeyVersion: 4, vdkVersion: 3 },
  memberVaultKey: {
    wrappedVaultKey: { descriptor: { scope: { organizationId: '00112233-4455-4677-8899-aabbccddeeff' } } },
  },
  discoveryKey: { opaque: 'discovery-key' },
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { wrapper, invalidateSpy }
}

const input = {
  vaultId: vault.id,
  label: 'Stripe',
  agentLabel: 'Stripe work',
  type: ENTRY_TYPE_KEY,
  payload: { type: ENTRY_TYPE_KEY, value: 'sk_live_1' } as const,
  policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY),
}

describe('useCreateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVault.mockResolvedValue(vault)
    mocks.collectGrants.mockResolvedValue([])
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(5) })
  })

  it('builds and submits one canonical revision without plaintext fields on the wire', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })
    result.current.mutate(input)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.createMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: '22222233-4455-4677-8899-aabbccddeeff' }),
      expect.objectContaining({ label: 'Stripe', agentLabel: 'Stripe work', payload: input.payload }),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      1,
    )
    const [, body] = mocks.createEntry.mock.calls[0]
    expect(body).toEqual(expect.objectContaining({
      entryId: '22222233-4455-4677-8899-aabbccddeeff',
      entryKey: { opaque: 'entry-key' },
      memberIndex: { opaque: 'member-index' },
      memberSecret: { opaque: 'member-secret' },
      agentDiscovery: { opaque: 'agent-discovery' },
      deliveryPolicy: 'standard',
    }))
    expect(body).not.toHaveProperty('label')
    expect(body).not.toHaveProperty('content')
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('fails closed before network work when the private key is unavailable', async () => {
    useAuthStore.setState({ privateKey: null })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })
    result.current.mutate(input)
    await waitFor(() => expect(result.current.error).toBeInstanceOf(VaultLockedError))
    expect(mocks.getVault).not.toHaveBeenCalled()
    expect(mocks.createEntry).not.toHaveBeenCalled()
  })

  it('does not enumerate or fan out active FULL grants for a new Entry', async () => {
    mocks.collectGrants.mockResolvedValue([{ grantId: 'grant-1', agentPublicKey: 'public-key' }])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })
    result.current.mutate(input)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.collectGrants).not.toHaveBeenCalled()
    expect(mocks.createEntry).toHaveBeenCalledOnce()
    expect(mocks.createEntry.mock.calls[0][1]).not.toHaveProperty('grantEnvelopes')
  })

  it('invalidates encrypted sync consumers after success', async () => {
    const { wrapper, invalidateSpy } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })
    result.current.mutate(input)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.createEntry.mock.calls[0][1]).not.toHaveProperty('entryType')
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey)
    expect(invalidatedKeys).toContainEqual(VAULTS_QUERY_KEY)
    expect(invalidatedKeys).toContainEqual(entriesQueryKey(vault.id))
  })

  it('uploads a custom icon only after the Entry exists and commits its encrypted reference', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateEntry(), { wrapper })
    const iconFile = new File(['png'], 'icon.png', { type: 'image/png' })

    result.current.mutate({ ...input, iconReference: 'blob:preview', iconFile })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.createEntry).toHaveBeenCalledOnce()
    expect(mocks.uploadIcon).toHaveBeenCalledWith(expect.objectContaining({
      file: iconFile,
      scope: expect.objectContaining({
        entryId: '22222233-4455-4677-8899-aabbccddeeff',
        target: 2,
      }),
    }))
    expect(mocks.createMaterial).toHaveBeenLastCalledWith(
      expect.objectContaining({ revision: '2' }),
      expect.objectContaining({ iconReference: 'vault-asset:33333333-4455-4677-8899-aabbccddeeff' }),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      2,
    )
    expect(mocks.updateEntry).toHaveBeenCalledOnce()
  })
})
