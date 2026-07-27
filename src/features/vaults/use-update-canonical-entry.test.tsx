import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { ENTRY_TYPE_KEY } from './types'
import { useUpdateCanonicalEntry } from './use-update-canonical-entry'

const mocks = vi.hoisted(() => ({
  getGrants: vi.fn(), getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32).fill(1)),
  openDiscoveryKey: vi.fn(async () => new Uint8Array(32).fill(2)),
  createMaterial: vi.fn(async () => ({ baseRevision: '1', memberSecret: { revision: '2', ciphertext: 'secret' },
    agentDiscoveryChanged: false, grantEnvelopes: [] })),
  projections: vi.fn(() => ({ memberSecret: { schemaVersion: 1, content: {} } })),
  produce: vi.fn(async () => ({ grantId: 'grant', entryId: 'entry' })),
  update: vi.fn(async () => ({ currentRevision: '2' })), wipe: vi.fn(),
}))
vi.mock('../grants', () => ({ GRANT_STATUS_ACTIVE: 'active', GRANT_TYPE_FULL: 'full', getOrgGrants: mocks.getGrants }))
vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-v2-member-sync', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/vault-v2-rotation', () => ({ openDiscoveryKey: mocks.openDiscoveryKey }))
vi.mock('../../shared/crypto/vault-v2-entry', () => ({
  createEntryUpdateMaterial: mocks.createMaterial,
  buildEntryProjections: mocks.projections,
}))
vi.mock('../../shared/crypto/grant-envelope', () => ({ produceGrantEntryEnvelope: mocks.produce }))
vi.mock('./api/vault-api', () => ({ updateCanonicalEntry: mocks.update }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } }) }, children)
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
    mocks.getVault.mockResolvedValue({ memberVaultKey: { memberId: 'member' }, memberKeyGeneration: 3,
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
      fieldIds: ['value'], narrowToPolicy: true,
      scope: expect.objectContaining({ entryRevision: '2', grantEnvelopeRevision: '10',
        grantKeyVersion: 6, memberKeyGeneration: 3, recipientAgentKeyVersion: 4,
        approvedMethods: 6, remainingUses: 5 }),
    }))
    expect(mocks.update.mock.calls[0][2].grantEnvelopes).toEqual([{ grantId: 'grant', entryId: 'entry' }])
  })

  it('submits canonical ciphertext without grant material when no coverage exists and wipes keys', async () => {
    const { result } = renderHook(() => useUpdateCanonicalEntry('vault', 'entry'), { wrapper })
    result.current.mutate(input as never)
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.update.mock.calls[0][2]).not.toHaveProperty('draft')
    expect(mocks.produce).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })
})
