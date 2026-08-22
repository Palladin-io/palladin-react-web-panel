import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../../shared/api/types'
import { StaleAuthenticatedSessionError } from '../auth/session/session-boundary'
import { useAuthStore } from '../auth/stores/auth-store'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  prepareFull: vi.fn(),
  getFullMaterial: vi.fn(),
  appendFullEntries: vi.fn(),
  commitFull: vi.fn(),
  cancelFull: vi.fn(),
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  decrypt: vi.fn(async () => ({ schemaVersion: 1 })),
  produce: vi.fn(),
  wipe: vi.fn(),
  privateKey: new Uint8Array(32),
  vaultState: { status: 'ready', entries: new Map() },
}))
vi.mock('./api/org-grants-api', async (original) => ({
  ...(await original<typeof import('./api/org-grants-api')>()),
  createGrantProactively: mocks.create,
}))
vi.mock('./api/full-grant-preparations-api', () => ({
  prepareFullGrant: mocks.prepareFull,
  getFullGrantPreparationMaterial: mocks.getFullMaterial,
  appendFullGrantPreparationEntries: mocks.appendFullEntries,
  commitFullGrantPreparation: mocks.commitFull,
  cancelFullGrantPreparation: mocks.cancelFull,
}))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/stores/member-sync-store', () => ({ useMemberSyncStore: {
  getState: () => ({ vaults: new Map([['v1', mocks.vaultState]]) }),
} }))
vi.mock('../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.decrypt }))
vi.mock('../../shared/crypto/grant-protocol', () => ({
  buildCanonicalGrantEnvelope: mocks.produce,
}))
vi.mock('../../shared/crypto/vault-plaintext', () => ({ listGrantableFieldIds: vi.fn(() => ['value']) }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../auth', () => ({
  authenticatedQueryKey: (queryKey: readonly unknown[]) => queryKey,
  useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) },
}))

import { useCreateGrant } from './use-create-grant'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })}>{children}</QueryClientProvider>
}

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, org_id: organizationId })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: true,
  }
}

describe('useCreateGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    mocks.vaultState.status = 'ready'
    mocks.vaultState.entries = new Map()
    mocks.create.mockResolvedValue({ id: 'new' })
    mocks.prepareFull.mockResolvedValue({
      grantId: 'g1', organizationId: 'org', preparationExpiresAt: '2026-08-14T22:30:00Z',
      memberKeyGeneration: 3, agentAccessEpoch: 2, recipientAgentKeyVersion: 4,
      agentKeyFingerprint: 'fingerprint', agentPublicKey: 'PK',
    })
    mocks.getFullMaterial.mockResolvedValue({ items: [], nextAfterEntryId: null })
    mocks.appendFullEntries.mockResolvedValue({ acceptedEntries: 0, totalPreparedEntries: 0 })
    mocks.commitFull.mockResolvedValue({ id: 'g1' })
    mocks.cancelFull.mockResolvedValue(undefined)
    mocks.decrypt.mockResolvedValue({ schemaVersion: 1 })
    mocks.getVault.mockResolvedValue({
      organizationId: 'org',
      memberVaultKey: {},
      memberKeyGeneration: 3,
      currentKeyEpoch: { vaultKeyVersion: 2 },
    })
    mocks.getEntry.mockImplementation(async (_vaultId: string, entryId: string) => ({
      organizationId: 'org', id: entryId, currentRevision: '7', entryKey: {}, memberSecret: {},
    }))
    mocks.produce.mockImplementation(async ({ entryId }: { entryId: string }) => ({
      entryId,
      descriptor: { binding: { recipientKeyFingerprint: 'fingerprint' } },
    }))
  })

  it('creates one exact-revision GRANULAR envelope with a client-owned Grant id', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      type: 'granular', entryId: 'e1', policy: { queryLimit: 3 }, methods: ['exec', 'inject'],
    })
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    const [, body] = mocks.create.mock.calls[0]
    expect(body.grantId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.entryId).toBe('e1')
    expect(body.methods).toBe('Exec, Inject')
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({
      entryRevision: '7', grantEnvelopeRevision: '1', grantKeyVersion: 1,
      memberKeyGeneration: 3, recipientKeyVersion: 4,
      approvedMethods: 6, remainingUses: 3,
    }))
    expect(mocks.prepareFull).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalled()
  })

  it('wraps the authoritative FULL material page instead of enumerating the local Entry index', async () => {
    mocks.getFullMaterial.mockResolvedValue({
      items: [
        { entryId: 'e1', entryRevision: '7', entryKey: {}, memberSecret: {} },
        { entryId: 'e3', entryRevision: '7', entryKey: {}, memberSecret: {} },
      ],
      nextAfterEntryId: null,
    })
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: null, recipientAgentKeyVersion: null,
      type: 'full', policy: {}, methods: ['get'],
    })
    await waitFor(() => expect(mocks.commitFull).toHaveBeenCalled(), { timeout: 5_000 })
    expect(mocks.prepareFull).toHaveBeenCalledTimes(1)
    expect(mocks.prepareFull).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ methods: 'Get' }),
      expect.objectContaining({ userId: 'user-a', organizationId: 'org-a' }),
    )
    expect(mocks.getFullMaterial).toHaveBeenCalledTimes(1)
    expect(mocks.getEntry).not.toHaveBeenCalled()
    expect(mocks.produce).toHaveBeenCalledTimes(2)
    expect(mocks.appendFullEntries).toHaveBeenCalledWith(
      'v1',
      expect.any(String),
      [
        expect.objectContaining({ entryId: 'e1' }),
        expect.objectContaining({ entryId: 'e3' }),
      ],
      expect.objectContaining({ userId: 'user-a', organizationId: 'org-a' }),
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('uses six bounded material pages and appends for a 501-entry FULL grant', async () => {
    const items = Array.from({ length: 501 }, (_, index) => ({
      entryId: `e${index + 1}`, entryRevision: '7', entryKey: {}, memberSecret: {},
    }))
    mocks.getFullMaterial.mockImplementation(async (
      _vaultId: string,
      _grantId: string,
      _expected: unknown,
      afterEntryId?: string,
    ) => {
      const offset = afterEntryId ? Number(afterEntryId.slice(1)) : 0
      const page = items.slice(offset, offset + 100)
      const nextAfterEntryId = offset + page.length < items.length
        ? page.at(-1)!.entryId
        : null
      return { items: page, nextAfterEntryId }
    })

    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: null, recipientAgentKeyVersion: null,
      type: 'full', policy: {}, methods: ['get'],
    })

    expect(mocks.prepareFull).toHaveBeenCalledTimes(1)
    expect(mocks.getFullMaterial).toHaveBeenCalledTimes(6)
    expect(mocks.appendFullEntries).toHaveBeenCalledTimes(6)
    expect(mocks.appendFullEntries.mock.calls.map((call) => call[2].length))
      .toEqual([100, 100, 100, 100, 100, 1])
    expect(mocks.getEntry).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.commitFull).toHaveBeenCalledTimes(1)
    expect(mocks.cancelFull).not.toHaveBeenCalled()
    expect(mocks.produce.mock.calls.every(([input]) => input.approvedMethods === 1)).toBe(true)
  })

  it('commits a FULL grant for an empty Vault without an append', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: null, recipientAgentKeyVersion: null,
      type: 'full', policy: {}, methods: ['get'],
    })

    await waitFor(() => expect(mocks.commitFull).toHaveBeenCalled())

    expect(mocks.getFullMaterial).toHaveBeenCalledTimes(1)
    expect(mocks.appendFullEntries).not.toHaveBeenCalled()
  })

  it('best-effort cancels a FULL preparation when local envelope production fails', async () => {
    mocks.getFullMaterial.mockResolvedValue({
      items: [{ entryId: 'e1', entryRevision: '7', entryKey: {}, memberSecret: {} }],
      nextAfterEntryId: null,
    })
    mocks.decrypt.mockRejectedValue(new Error('invalid ciphertext'))
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: null, recipientAgentKeyVersion: null,
      type: 'full', policy: {}, methods: ['get'],
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(mocks.cancelFull).toHaveBeenCalledTimes(1)
    expect(mocks.commitFull).not.toHaveBeenCalled()
  })

  it('propagates an append conflict, cancels, and never logs material', async () => {
    const ciphertextCanary = 'CIPHERTEXT_MUST_NOT_BE_LOGGED'
    const conflict = new Error('409 Conflict')
    mocks.getFullMaterial.mockResolvedValue({
      items: [{
        entryId: 'e1', entryRevision: '7', entryKey: {},
        memberSecret: { encodedSuitePayload: ciphertextCanary },
      }],
      nextAfterEntryId: null,
    })
    mocks.appendFullEntries.mockRejectedValue(conflict)
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ]

    try {
      const { result } = renderHook(() => useCreateGrant(), { wrapper })
      await expect(result.current.mutateAsync({
        vaultId: 'v1', agentId: 'a1', agentPublicKey: null, recipientAgentKeyVersion: null,
        type: 'full', policy: {}, methods: ['get'],
      })).rejects.toBe(conflict)

      expect(mocks.cancelFull).toHaveBeenCalledTimes(1)
      expect(mocks.commitFull).not.toHaveBeenCalled()
      expect(JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls))).not.toContain(ciphertextCanary)
    } finally {
      for (const spy of logSpies) spy.mockRestore()
    }
  })

  it('preserves user-selected methods for a Credit Card envelope and request body', async () => {
    mocks.decrypt.mockResolvedValue({ schemaVersion: 1, entryType: 'creditCard' })
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      type: 'granular', entryId: 'e1', policy: {}, methods: ['exec', 'inject'],
    })
    await waitFor(() => expect(mocks.create).toHaveBeenCalled())
    expect(mocks.produce).toHaveBeenCalledWith(expect.objectContaining({ approvedMethods: 6 }))
    expect(mocks.create.mock.calls[0][1].methods).toBe('Exec, Inject')
  })

  it('uses the same selected methods for mixed Script and Credit Card FULL material', async () => {
    mocks.getFullMaterial.mockResolvedValue({
      items: [
        { entryId: 'e1', entryRevision: '7', entryKey: {}, memberSecret: {} },
        { entryId: 'e2', entryRevision: '7', entryKey: {}, memberSecret: {} },
      ],
      nextAfterEntryId: null,
    })
    mocks.decrypt
      .mockResolvedValueOnce({ schemaVersion: 1, entryType: 'script' })
      .mockResolvedValueOnce({ schemaVersion: 1, entryType: 'creditCard' })
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    await result.current.mutateAsync({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: null, recipientAgentKeyVersion: null,
      type: 'full', policy: {}, methods: ['exec', 'inject'],
    })
    expect(mocks.produce).toHaveBeenCalledTimes(2)
    expect(mocks.produce).toHaveBeenNthCalledWith(1, expect.objectContaining({ approvedMethods: 6 }))
    expect(mocks.produce).toHaveBeenNthCalledWith(2, expect.objectContaining({ approvedMethods: 6 }))
    expect(mocks.appendFullEntries).toHaveBeenCalledTimes(1)
    expect(mocks.commitFull).toHaveBeenCalledTimes(1)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('fails before opening keys when recipient identity metadata is missing', async () => {
    const { result } = renderHook(() => useCreateGrant(), { wrapper })
    result.current.mutate({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: null,
      type: 'granular', entryId: 'e1', policy: {}, methods: ['exec'],
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('does not send an A grant envelope after switching to B before the final request', async () => {
    let releaseEnvelope!: (envelope: unknown) => void
    mocks.produce.mockImplementationOnce(() => new Promise((resolve) => {
      releaseEnvelope = resolve
    }))
    const { result } = renderHook(() => useCreateGrant(), { wrapper })

    const execution = result.current.mutateAsync({
      vaultId: 'v1', agentId: 'a1', agentPublicKey: 'PK', recipientAgentKeyVersion: 4,
      type: 'granular', entryId: 'e1', policy: {}, methods: ['get'],
    })
    await waitFor(() => expect(mocks.produce).toHaveBeenCalledOnce())
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    releaseEnvelope({
      entryId: 'e1',
      descriptor: { binding: { recipientKeyFingerprint: 'fingerprint' } },
    })

    await expect(execution).rejects.toBeInstanceOf(StaleAuthenticatedSessionError)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(useAuthStore.getState().userId).toBe('user-b')
  })
})
