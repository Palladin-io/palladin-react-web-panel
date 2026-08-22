import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT } from './types'
import { useUpdateCanonicalEntry } from './use-update-canonical-entry'

const mocks = vi.hoisted(() => ({
  getGrants: vi.fn(), getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32).fill(1)),
  openDiscoveryKey: vi.fn(async () => new Uint8Array(32).fill(2)),
  createMaterial: vi.fn(async () => ({ entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null })),
  toSecret: vi.fn(({ type }: { type: number }) => ({
    entryType: type === ENTRY_TYPE_SCRIPT ? 'script' : 'key',
    content: { customFields: [] }, agentFieldAccess: { value: 'onGrantValue' },
  })),
  produce: vi.fn(async () => ({ grantId: 'grant', entryId: 'entry' })),
  update: vi.fn(async () => ({ currentRevision: '2' })), wipe: vi.fn(),
}))
vi.mock('../grants', () => ({ GRANT_STATUS_ACTIVE: 'active', GRANT_TYPE_FULL: 'full', getOrgGrants: mocks.getGrants }))
vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openVaultKey, openVaultDerivedEnvelope: mocks.openDiscoveryKey,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({ sealCanonicalEntry: mocks.createMaterial }))
vi.mock('../../shared/crypto/entry-draft', () => ({ toMemberSecret: mocks.toSecret }))
vi.mock('../../shared/crypto/vault-plaintext', () => ({ projectAgentDiscovery: vi.fn(() => null) }))
vi.mock('../../shared/crypto/grant-protocol', () => ({
  buildCanonicalGrantEnvelope: mocks.produce,
  listGrantableFields: vi.fn(() => [
    { id: 'value', label: 'value', access: 'onGrantValue' },
    { id: 'custom:new', label: 'New field', access: 'onGrantValue' },
  ]),
}))
vi.mock('./api/vault-api', () => ({ updateCanonicalEntry: mocks.update }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } }) }, children)
}

const input = {
  detail: { organizationId: 'org', vaultId: 'vault', id: 'entry', currentRevision: '1',
    memberIndexRevision: '1', agentDiscoveryRevisionHighWatermark: '0', currentKeyVersion: 1,
    entryKey: { descriptor: { resourceRevision: '1' } } },
  previous: { schemaVersion: 1 as const, memberLabel: 'Old', agentLabel: 'Agent', entryType: ENTRY_TYPE_KEY,
    content: { type: ENTRY_TYPE_KEY, value: 'secret' }, agentVisibilityPolicy: { discoverable: true, fields: {} } },
  draft: { memberLabel: 'New', agentLabel: 'Agent', color: '#EB4747', entryType: ENTRY_TYPE_KEY,
    content: { type: ENTRY_TYPE_KEY, value: 'secret' }, policy: { discoverable: true, fields: {} } },
}

describe('useUpdateCanonicalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
    mocks.getGrants.mockResolvedValue({ items: [], nextCursor: null })
    mocks.getVault.mockResolvedValue({ memberVaultKey: {}, memberKeyGeneration: 3,
      currentKeyEpoch: { vaultKeyVersion: 1, vdkVersion: 1 }, discoveryKey: {} })
  })

  it('atomically refreshes each active covering grant against the new Entry revision', async () => {
    mocks.getGrants.mockResolvedValue({ items: [{
      id: 'grant', type: 'full', agentId: 'agent', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      methods: 'exec, inject', expiresAt: null, queryLimit: 8, queryCount: 3,
      entryScopes: [{ entryId: 'entry', fieldIds: ['value'], grantEnvelopeRevision: '9',
        entryRevision: '1', grantKeyVersion: 5 }],
    }], nextCursor: null })
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(input as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({
      approvedFieldIds: ['value'], entryRevision: '2', grantEnvelopeRevision: '10',
      grantKeyVersion: 6, memberKeyGeneration: 3, recipientKeyVersion: 4,
      approvedMethods: 6, remainingUses: 5,
    }))
    expect(mocks.update.mock.calls[0][2].grantEnvelopes).toEqual([{ grantId: 'grant', entryId: 'entry' }])
  })

  it('preserves an existing grant mask when an Entry changes to Script', async () => {
    mocks.getGrants.mockResolvedValue({ items: [{
      id: 'grant', type: 'full', agentId: 'agent', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      methods: 'exec, inject', expiresAt: null, queryLimit: null,
      entryScopes: [{ entryId: 'entry', fieldIds: ['value'], grantEnvelopeRevision: '9',
        entryRevision: '1', grantKeyVersion: 5 }],
    }], nextCursor: null })
    const scriptInput = {
      ...input,
      draft: {
        ...input.draft,
        entryType: ENTRY_TYPE_SCRIPT,
        content: { type: ENTRY_TYPE_SCRIPT, script: 'echo ok', refs: [] },
      },
    }
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(scriptInput as never)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({ approvedMethods: 6 }))
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  it('submits canonical ciphertext without grant material when no coverage exists and wipes keys', async () => {
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(input as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.update.mock.calls[0][2]).not.toHaveProperty('draft')
    expect(mocks.createMaterial).toHaveBeenCalledWith(expect.objectContaining({
      revision: '2', entryKeyRevision: '1', entryKeyVersion: 2, memberIndexRevision: '2',
    }), expect.anything(), expect.anything(), expect.anything(), 2)
    expect(mocks.toSecret).toHaveBeenCalledWith(expect.objectContaining({ color: '#EB4747' }))
    expect(mocks.produce).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('takes the batch target from detail.id when no fixed Entry id is provided', async () => {
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault'), { wrapper })
    result.current.mutate(input as never)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.update).toHaveBeenCalledWith('vault', 'entry', expect.anything())
    expect(mocks.createMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'entry' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      2,
    )
  })

  it('rejects a fixed Entry id that does not match the canonical detail scope', async () => {
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'another-entry'), { wrapper })
    result.current.mutate(input as never)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Canonical Entry update scope mismatch')
    expect(mocks.getGrants).not.toHaveBeenCalled()
    expect(mocks.getVault).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not submit ciphertext prepared by a replaced unlock session', async () => {
    let finishMaterial: ((value: {
      entryKey: object; memberIndex: object; memberSecret: object; agentDiscovery: null
    }) => void) | undefined
    mocks.createMaterial.mockImplementationOnce(() => new Promise((resolve) => { finishMaterial = resolve }))
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(input as never)
    await waitFor(() => expect(mocks.createMaterial).toHaveBeenCalled())

    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) })
    finishMaterial?.({ entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('does not submit batch plaintext after its non-secret crypto session generation changes', async () => {
    let finishMaterial: ((value: {
      entryKey: object; memberIndex: object; memberSecret: object; agentDiscovery: null
    }) => void) | undefined
    mocks.createMaterial.mockImplementationOnce(() => new Promise((resolve) => { finishMaterial = resolve }))
    const cryptoSessionGeneration = useAuthStore.getState().cryptoSessionGeneration
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault'), { wrapper })
    result.current.mutate({ ...input, cryptoSessionGeneration } as never)
    await waitFor(() => expect(mocks.createMaterial).toHaveBeenCalled())

    useAuthStore.setState({ cryptoSessionGeneration: cryptoSessionGeneration + 1 })
    finishMaterial?.({ entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: null })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })
})
