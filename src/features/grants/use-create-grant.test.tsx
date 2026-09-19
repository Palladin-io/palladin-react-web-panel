import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  openSigningKey: vi.fn(async () => new Uint8Array(64)),
  decrypt: vi.fn(async () => ({ schemaVersion: 1, entryType: 'key' })),
  produce: vi.fn(),
  fields: vi.fn(() => [{ id: 'value' }]),
  buildFull: vi.fn(),
  buildScriptPackage: vi.fn(),
  wipe: vi.fn(),
  privateKey: new Uint8Array(32),
  vaultState: { status: 'ready' },
}))

vi.mock('./api/org-grants-api', async (original) => ({
  ...(await original<typeof import('./api/org-grants-api')>()),
  createFullGrant: mocks.create,
  createGranularGrant: mocks.create,
  createScriptExecutionGrant: mocks.create,
}))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/stores/member-sync-store', () => ({ useMemberSyncStore: {
  getState: () => ({ vaults: new Map([['v1', mocks.vaultState]]) }),
} }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openVaultKey,
  openVaultDerivedEnvelope: mocks.openSigningKey,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.decrypt }))
vi.mock('../../shared/crypto/grant-protocol', () => ({ buildCanonicalGrantEnvelope: mocks.produce, listGrantableFields: mocks.fields }))
vi.mock('../../shared/crypto/x25519-wrapper', () => ({ buildAgentWrappedVaultKey: mocks.buildFull }))
vi.mock('../vaults/script-execution-package', () => ({
  buildCompleteScriptExecutionPackage: mocks.buildScriptPackage,
}))
vi.mock('../../shared/crypto/vault-plaintext', async (original) => ({
  ...await original<typeof import('../../shared/crypto/vault-plaintext')>(),
  listGrantableFieldIds: vi.fn(() => ['value']),
}))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) } }))

import { useCreateGrant } from './use-create-grant'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

describe('useCreateGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.vaultState.status = 'ready'
    mocks.create.mockResolvedValue({ id: 'new' })
    mocks.getVault.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      memberVaultKey: {},
      memberKeyGeneration: 3,
      currentKeyEpoch: { vaultKeyVersion: 2, manifestSigningKeyVersion: 5 },
      vaultPrivateKeys: [{ descriptor: { purpose: 4, keyVersion: 5 } }],
    })
    mocks.getEntry.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      id: '33333333-3333-4333-8332-333333333333',
      currentRevision: '7',
      entryKey: {},
      memberSecret: {},
    })
    mocks.produce.mockResolvedValue({ descriptor: { binding: {} } })
    mocks.buildFull.mockResolvedValue({
      wrappedVaultKey: { descriptor: {}, encodedSealedKeyPackage: 'sealed' },
    })
    mocks.buildScriptPackage.mockResolvedValue({
      contractVersion: 1,
      scriptRevision: '7',
      encodedPackageCiphertext: 'sealed-script-package',
    })
  })

  it('creates one exact-revision GRANULAR envelope', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: 2,
      type: 'granular',
      entryId: '33333333-3333-4333-8332-333333333333',
      policy: { queryLimit: 3 },
      methods: ['exec', 'inject'],
    })

    const [, entryId, body] = mocks.create.mock.calls[0]
    expect(entryId).toBe('33333333-3333-4333-8332-333333333333')
    expect(body.grantEntry).toBeDefined()
    expect(body.agentWrappedVaultKey).toBeUndefined()
    expect(body.methods).toBe('Exec, Inject')
    expect(body.fieldSelectionMode).toBe('all')
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({
      entryRevision: '7',
      memberKeyGeneration: 3,
      recipientKeyVersion: 4,
      approvedMethods: 6,
      remainingUses: 3,
    }))
    expect(mocks.wipe).toHaveBeenCalled()
  })

  it.each([['value'], [], ['private-field'], ['value', 'value']])('validates selected scope %j before posting', async (...fieldIds) => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    const creating = result.current.mutateAsync({ vaultId: 'v1', entryId: 'entry', agentId: 'agent',
      agentPublicKey: 'public', recipientAgentKeyVersion: 1, agentAccessEpoch: 1, type: 'granular',
      fieldSelection: { mode: 'selected', fieldIds }, policy: {}, methods: ['inject'] })
    if (fieldIds.length === 1 && fieldIds[0] === 'value') {
      await creating
      expect(mocks.create).toHaveBeenCalledWith('v1', 'entry', expect.objectContaining({ fieldSelectionMode: 'selected' }))
      expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({ approvedFieldIds: ['value'] }))
    } else {
      await expect(creating).rejects.toThrow()
      expect(mocks.create).not.toHaveBeenCalled()
      expect(mocks.produce).not.toHaveBeenCalled()
    }
  })

  it.each([['value', 'notes'], ['value', 'key.notes']])('retains the currently permitted regrant subset %j', async (...fieldIds) => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({ vaultId: 'v1', entryId: 'entry', agentId: 'agent',
      agentPublicKey: 'public', recipientAgentKeyVersion: 1, agentAccessEpoch: 1, type: 'granular',
      fieldSelection: { mode: 'selected', fieldIds }, policy: {}, methods: ['inject'] })
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({ approvedFieldIds: ['value'] }))
    expect(mocks.create).toHaveBeenCalledWith('v1', 'entry', expect.objectContaining({ fieldSelectionMode: 'selected' }))
  })

  it('normalizes retained payload notes IDs before applying current policy', async () => {
    mocks.fields.mockReturnValueOnce([{ id: 'notes' }])
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({ vaultId: 'v1', entryId: 'entry', agentId: 'agent',
      agentPublicKey: 'public', recipientAgentKeyVersion: 1, agentAccessEpoch: 1, type: 'granular',
      fieldSelection: { mode: 'selected', fieldIds: ['key.notes', 'key.url'] }, policy: {}, methods: ['inject'] })
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({ approvedFieldIds: ['notes'] }))
  })

  it('rejects a new granular credit-card grant before sealing', async () => {
    mocks.decrypt.mockResolvedValueOnce({ schemaVersion: 1, entryType: 'creditCard' })
    const { result } = renderHook(() => useCreateGrant(), { wrapper })

    await expect(result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: 2,
      type: 'granular',
      entryId: '33333333-3333-4333-8332-333333333333',
      policy: {},
      methods: ['inject'],
    })).rejects.toThrow('Cannot produce a revision-bound grant envelope')

    expect(mocks.produce).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalled()
  })

  it('creates FULL with one whole-VK wrapper and no per-entry envelopes', async () => {
    mocks.vaultState.status = 'idle'
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: 2,
      type: 'full',
      policy: {},
      methods: ['get'],
    })

    expect(mocks.buildFull).toHaveBeenCalledTimes(1)
    expect(mocks.buildFull).toHaveBeenCalledWith(expect.objectContaining({
      vaultKey: expect.any(Uint8Array),
      agentAccessEpoch: 2,
      vaultKeyVersion: 2,
      recipientAgentKeyVersion: 4,
      vaultSigningKeyVersion: 5,
      vaultSigningPrivateKey: expect.any(Uint8Array),
    }))
    const [, body] = mocks.create.mock.calls[0]
    expect(body.agentWrappedVaultKey).toBeDefined()
    expect(body.grantEntry).toBeUndefined()
    expect(mocks.getEntry).not.toHaveBeenCalled()
    expect(mocks.produce).not.toHaveBeenCalled()
  })

  it('creates one ScriptExecution grant with one complete package and Exec only', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: 2,
      type: 'scriptExecution',
      entryId: '33333333-3333-4333-8332-333333333333',
      reviewedScriptRevision: '7',
      policy: { queryLimit: 3 },
      methods: ['exec'],
    })

    expect(mocks.buildScriptPackage).toHaveBeenCalledTimes(1)
    expect(mocks.buildScriptPackage).toHaveBeenCalledWith(expect.objectContaining({
      scriptEntryId: '33333333-3333-4333-8332-333333333333',
      packageRevision: '1',
      agentAccessEpoch: 2,
      recipientAgentKeyVersion: 4,
    }))
    const [, scriptEntryId, body] = mocks.create.mock.calls[0]
    expect(scriptEntryId).toBe('33333333-3333-4333-8332-333333333333')
    expect(body).toMatchObject({
      methods: 'Exec',
      queryLimit: 3,
      scriptPackage: { encodedPackageCiphertext: 'sealed-script-package' },
    })
    expect(body.grantEntry).toBeUndefined()
    expect(mocks.getEntry).not.toHaveBeenCalled()
    expect(mocks.produce).not.toHaveBeenCalled()
  })

  it('does not create a Script grant when its revision changed after review', async () => {
    mocks.buildScriptPackage.mockResolvedValueOnce({
      contractVersion: 1,
      scriptRevision: '8',
      encodedPackageCiphertext: 'sealed-script-package',
    })
    const { result } = renderHook(() => useCreateGrant(), { wrapper })

    await expect(result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: 2,
      type: 'scriptExecution',
      entryId: '33333333-3333-4333-8332-333333333333',
      reviewedScriptRevision: '7',
      policy: {},
      methods: ['exec'],
    })).rejects.toThrow('Cannot produce a revision-bound grant envelope')

    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('fails before opening Vault keys when access-epoch metadata is missing', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await expect(result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: null,
      type: 'full',
      policy: {},
      methods: ['get'],
    })).rejects.toThrow('Cannot produce a revision-bound grant envelope')
    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('wipes the opened VK when FULL wrapping fails', async () => {
    mocks.buildFull.mockRejectedValueOnce(new Error('recipient mismatch'))
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await expect(result.current.mutateAsync({
      vaultId: 'v1',
      agentId: '22222222-2222-4222-8222-222222222222',
      agentPublicKey: 'agent-public-key',
      recipientAgentKeyVersion: 4,
      agentAccessEpoch: 2,
      type: 'full',
      policy: {},
      methods: ['get'],
    })).rejects.toThrow('recipient mismatch')
    expect(mocks.create).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.wipe).toHaveBeenCalled())
  })
})
