import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from './types'
import type { ParsedEntry } from './import'
import { useImportEntries } from './use-import-entries'
import { VaultLockedError } from './use-create-entry'
import { entriesQueryKey } from './use-entries'
import { VAULTS_QUERY_KEY } from './use-vaults'
import { useMemberSyncStore } from './sync/member-sync-store'

const { importEntriesMock, updateEntryMock, fullGrantsMock, grantEnvelopeMock, challengesMock, encryptedVaultMock, toMemberSecretMock, ensureWebsiteIconsMock, openVaultKeyMock } = vi.hoisted(() => ({
  importEntriesMock: vi.fn(async (_vaultId: string, body: { entries: unknown[] }) => ({
    importedCount: body.entries.length,
    entryIds: body.entries.map((_, i) => `e${i}`),
  })),
  updateEntryMock: vi.fn(async () => undefined),
  fullGrantsMock: vi.fn(async () => [] as unknown[]),
  grantEnvelopeMock: vi.fn(async ({ grantId, entryId }: { grantId: string; entryId: string }) => ({
    grantId, entryId,
  })),
  challengesMock: vi.fn(async (_vaultId: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({ entryId: `entry-${index}`, expiresAt: '2026-07-27T00:00:00Z' }))),
  encryptedVaultMock: vi.fn(async () => ({
    id: 'vault-1', memberKeyGeneration: 1,
    currentKeyEpoch: { vaultKeyVersion: 1, vdkVersion: 1 },
    memberVaultKey: { wrappedVaultKey: { descriptor: { scope: { organizationId: 'org-1' } } } },
    discoveryKey: {},
  })),
  toMemberSecretMock: vi.fn(({ label }: { label: string }) => ({
    schema: 'palladin.member-secret.v1', memberLabel: label, agentLabel: label,
    entryType: 'credential', content: { customFields: [] }, agentFieldAccess: {},
  })),
  ensureWebsiteIconsMock: vi.fn(async (
    hostnames: string[],
    _timeoutMs?: number,
    onProgress?: (ready: number, total: number) => void,
  ) => {
    onProgress?.(hostnames.length, hostnames.length)
    return new Map(hostnames.map((hostname) => [hostname, {
      id: '11111111-1111-4111-8111-111111111111', type: 'websiteIcon', name: hostname,
      revision: 1, url: `https://assets.palladin.io/${hostname}.png`,
    }]))
  }),
  openVaultKeyMock: vi.fn(async () => new Uint8Array(32)),
}))

vi.mock('../../shared/api/public-assets-api', () => ({
  normalizePublicHostname: (value: string) => value.includes('://')
    ? new URL(value).hostname
    : value || null,
  ensureWebsiteIcons: ensureWebsiteIconsMock,
  ensureWebsiteIconsWithin: ensureWebsiteIconsMock,
}))

vi.mock('./api/vault-api', () => ({
  importEntries: importEntriesMock,
  updateCanonicalEntry: updateEntryMock,
  issueEntryCreationChallenges: challengesMock,
  getCanonicalEntry: vi.fn(async () => ({
    id: 'old-1', organizationId: 'org-1', vaultId: 'vault-1', currentRevision: '1',
    currentKeyVersion: 1, memberIndexRevision: '1', agentDiscoveryRevisionHighWatermark: '1',
    entryKey: { descriptor: { resourceRevision: '1' } }, memberSecret: {},
  })),
}))

vi.mock('../grants', () => ({
  collectActiveFullGrants: fullGrantsMock,
  getOrgGrants: vi.fn(async () => ({ items: [], nextCursor: null })),
  GRANT_STATUS_ACTIVE: 'active',
  GRANT_TYPE_FULL: 'full',
}))

vi.mock('./sync/member-sync-api', () => ({
  getEncryptedVault: encryptedVaultMock,
}))

vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: openVaultKeyMock,
  openVaultDerivedEnvelope: vi.fn(async () => new Uint8Array(32)),
}))
vi.mock('../../shared/crypto/entry-draft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/entry-draft')>(),
  defaultAgentVisibilityPolicy: vi.fn(() => ({ discoverable: true, fields: {} })),
  toMemberSecret: toMemberSecretMock,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({
  sealCanonicalEntry: vi.fn(async () => ({
    entryKey: {}, memberIndex: {}, memberSecret: {}, agentDiscovery: {},
  })),
  openMemberSecret: vi.fn(async () => ({ memberLabel: 'old' })),
}))
vi.mock('../../shared/crypto/grant-protocol', () => ({
  buildCanonicalGrantEnvelope: grantEnvelopeMock,
  grantMethodsForSecret: vi.fn((_secret: unknown, methods: number) => methods),
  listGrantableFields: vi.fn(() => [{ id: 'credential.username' }]),
}))
vi.mock('../../shared/crypto/vault-plaintext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/vault-plaintext')>(),
  projectAgentDiscovery: vi.fn(() => null),
}))

vi.mock('../../shared/crypto/sodium', () => ({ wipe: vi.fn() }))

function credential(label: string): ParsedEntry {
  return { label, type: ENTRY_TYPE_CREDENTIAL, username: 'u', password: 'p' }
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

describe('useImportEntries', () => {
  beforeEach(() => {
    importEntriesMock.mockClear()
    updateEntryMock.mockClear()
    fullGrantsMock.mockReset()
    fullGrantsMock.mockResolvedValue([])
    challengesMock.mockClear()
    challengesMock.mockImplementation(async (_vaultId: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({ entryId: `entry-${index}`, expiresAt: '2026-07-27T00:00:00Z' })))
    encryptedVaultMock.mockClear()
    toMemberSecretMock.mockClear()
    ensureWebsiteIconsMock.mockClear()
    openVaultKeyMock.mockClear()
    encryptedVaultMock.mockResolvedValue({
      id: 'vault-1', memberKeyGeneration: 1,
      currentKeyEpoch: { vaultKeyVersion: 1, vdkVersion: 1 },
      memberVaultKey: { wrappedVaultKey: { descriptor: { scope: { organizationId: 'org-1' } } } },
      discoveryKey: {},
    })
    useAuthStore.setState({ privateKey: new Uint8Array(32) })
  })

  it('chunks creates to 50 per request and sums the imported count', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    const creates = Array.from({ length: 120 }, (_, i) => credential(`Entry ${i}`))
    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates,
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(importEntriesMock).toHaveBeenCalledTimes(3)
    expect(importEntriesMock.mock.calls[0][1].entries).toHaveLength(50)
    expect(importEntriesMock.mock.calls[0][1].entries[0]).not.toHaveProperty('entryType')
    expect(importEntriesMock.mock.calls[2][1].entries).toHaveLength(20)
    expect(result.current.data).toEqual({ importedCount: 120, updatedCount: 0, failed: [] })
  })

  it('persists an encrypted website reference only after the catalog returns a ready asset', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [{ ...credential('GitHub'), url: 'https://github.com/login' }],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toMemberSecretMock).toHaveBeenCalledWith(expect.objectContaining({
      iconReference: 'public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fgithub.com.png',
    }))
    expect(ensureWebsiteIconsMock).toHaveBeenCalledWith(['github.com'], 15_000, expect.any(Function))
  })

  it('omits the website reference when the catalog does not return a ready asset', async () => {
    ensureWebsiteIconsMock.mockResolvedValueOnce(new Map())
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [{ ...credential('Missing icon'), url: 'https://no-icon.example.com/login' }],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toMemberSecretMock).toHaveBeenCalledWith(expect.objectContaining({
      iconReference: undefined,
    }))
  })

  it.each([
    ['android://YJzPrGM_qk1v@com.binance.dev/', 'binance.com'],
    ['android://certificate@com.disney.disneyplus/', 'disneyplus.com'],
  ])('persists and schedules the inferred website icon for Android credential %s', async (url, hostname) => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'google-password-manager',
      creates: [{ ...credential('Android app'), url }],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(toMemberSecretMock).toHaveBeenCalledWith(expect.objectContaining({
      iconReference: `public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2F${hostname}.png`,
    }))
    expect(ensureWebsiteIconsMock).toHaveBeenCalledWith([hostname], 15_000, expect.any(Function))
  })

  it('resolves all imported hostnames in one catalog phase while saving 50-entry chunks', async () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })
    const creates = Array.from({ length: 539 }, (_, index) => ({
      ...credential(`Entry ${index}`), url: `https://app-${index}.example.com/login`,
    }))

    result.current.mutate({ vaultId: 'vault-1', format: 'generic-csv', creates, overwrites: [] })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(ensureWebsiteIconsMock).toHaveBeenCalledTimes(1)
    expect(ensureWebsiteIconsMock.mock.calls[0][0]).toHaveLength(539)
    expect(ensureWebsiteIconsMock.mock.calls[0][0]).toContain('app-538.example.com')
    expect(ensureWebsiteIconsMock.mock.calls[0][1]).toBe(15_000)
    expect(ensureWebsiteIconsMock.mock.calls[0][2]).toEqual(expect.any(Function))
    expect(importEntriesMock).toHaveBeenCalledTimes(11)
  })

  it('reports icon preparation before encryption starts', async () => {
    ensureWebsiteIconsMock.mockImplementationOnce(async (
      hostnames: string[],
      _timeoutMs: number,
      onProgress?: (ready: number, total: number) => void,
    ) => {
      onProgress?.(1, hostnames.length)
      return new Map()
    })
    const onProgress = vi.fn()
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [
        { ...credential('GitHub'), url: 'https://github.com/login' },
        { ...credential('GitLab'), url: 'https://gitlab.com/login' },
      ],
      overwrites: [],
      onProgress,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(onProgress).toHaveBeenCalledWith(0, 2, 'icons')
    expect(onProgress).toHaveBeenCalledWith(1, 2, 'icons')
    expect(onProgress).toHaveBeenCalledWith(2, 2, 'icons')
    expect(onProgress).toHaveBeenCalledWith(1, 2, 'encrypt')
  })

  it('does not open Vault key material while icon preparation is pending', async () => {
    let finishIcons!: (assets: Map<string, never>) => void
    ensureWebsiteIconsMock.mockImplementationOnce(() => new Promise((resolve) => {
      finishIcons = resolve
    }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [{ ...credential('GitHub'), url: 'https://github.com/login' }],
      overwrites: [],
    })

    await waitFor(() => expect(ensureWebsiteIconsMock).toHaveBeenCalled())
    expect(openVaultKeyMock).not.toHaveBeenCalled()
    useAuthStore.setState({ privateKey: undefined })
    finishIcons(new Map())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(VaultLockedError)
    expect(openVaultKeyMock).not.toHaveBeenCalled()
  })

  it('sends overwrites as individual updates and invalidates list keys', async () => {
    const { wrapper, invalidateSpy } = makeWrapper()
    const retryGeneration = useMemberSyncStore.getState().retryGeneration
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'palladin-json',
      creates: [{ label: 'Token', type: ENTRY_TYPE_KEY, value: 'sk_1' }],
      overwrites: [{ entryId: 'old-1', entry: credential('GitHub') }],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(updateEntryMock).toHaveBeenCalledTimes(1)
    expect(updateEntryMock.mock.calls[0][0]).toBe('vault-1')
    expect(result.current.data).toEqual({ importedCount: 1, updatedCount: 1, failed: [] })

    const keys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(VAULTS_QUERY_KEY)
    expect(keys).toContainEqual(entriesQueryKey('vault-1'))
    expect(useMemberSyncStore.getState().retryGeneration).toBe(retryGeneration + 1)
  })

  it('reports a rejected entry as failed instead of dropping the batch', async () => {
    // The chunk is atomic on the server — bisection retries down to the single
    // offender and reports it with the reason, so no other entry is lost.
    importEntriesMock.mockRejectedValueOnce(new Error('label: too long'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [credential('GitHub')],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.importedCount).toBe(0)
    expect(result.current.data?.failed).toEqual([
      { label: 'GitHub', reason: 'label: too long' },
    ])
  })

  it('bisects a failed chunk so valid entries still import', async () => {
    // 2-item chunk: whole chunk 400s, then each half retries — one succeeds,
    // the other is reported as failed.
    importEntriesMock.mockRejectedValueOnce(new Error('bad item'))
    importEntriesMock.mockResolvedValueOnce({ importedCount: 1, entryIds: ['e1'] })
    importEntriesMock.mockRejectedValueOnce(new Error('bad item'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [credential('GitHub'), credential('GitLab')],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.importedCount).toBe(1)
    expect(result.current.data?.failed).toEqual([
      { label: 'GitLab', reason: 'bad item' },
    ])
  })

  it('creates exact canonical envelopes for every active FULL grant', async () => {
    fullGrantsMock.mockResolvedValue([
      { grantId: 'g1', agentId: 'a1', agentPublicKey: 'pk1', recipientAgentKeyVersion: 1, methods: 'exec' },
      { grantId: 'g2', agentId: 'a2', agentPublicKey: 'pk2', recipientAgentKeyVersion: 1, methods: 'inject' },
    ])
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1',
      format: 'generic-csv',
      creates: [credential('GitHub'), credential('GitLab')],
      overwrites: [],
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(grantEnvelopeMock).toHaveBeenCalledTimes(4)
    expect(importEntriesMock.mock.calls[0][1].entries[0].grantEnvelopes).toHaveLength(2)
  })

  it('attributes Vault key preparation failures without exposing entry contents', async () => {
    encryptedVaultMock.mockRejectedValueOnce(new Error('unavailable'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1', format: 'generic-csv',
      creates: [credential('GitHub')], overwrites: [],
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ step: 'loadVault' })
    expect(result.current.error?.message).not.toContain('GitHub')
  })

  it('attributes secure Entry identifier reservation failures', async () => {
    challengesMock.mockRejectedValueOnce(new Error('unavailable'))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useImportEntries(), { wrapper })

    result.current.mutate({
      vaultId: 'vault-1', format: 'generic-csv',
      creates: [credential('GitHub')], overwrites: [],
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ step: 'challenge' })
  })
})
