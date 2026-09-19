import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  getAgent: vi.fn(),
  getEntry: vi.fn(),
  getVault: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  openMemberSecret: vi.fn(async () => ({ schemaVersion: 1, entryType: 'credential' })),
  buildEnvelope: vi.fn(),
  buildScriptPackage: vi.fn(),
  listFields: vi.fn(() => ['credential.password', 'credential.username']),
  wipe: vi.fn(),
  privateKey: new Uint8Array(32),
}))

vi.mock('../auth', () => ({ useAuthStore: { getState: () => ({ privateKey: mocks.privateKey }) } }))
vi.mock('../agents', () => ({ getAgent: mocks.getAgent }))
vi.mock('../vaults/api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../vaults/sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('../../shared/crypto/vault-protocol', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.openMemberSecret }))
vi.mock('../../shared/crypto/grant-protocol', () => ({ buildCanonicalGrantEnvelope: mocks.buildEnvelope }))
vi.mock('../../shared/crypto/vault-plaintext', () => ({ listGrantableFieldIds: mocks.listFields }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../vaults/script-execution-package', () => ({
  buildCompleteScriptExecutionPackage: mocks.buildScriptPackage,
}))
vi.mock('./api/pending-grants-api', () => ({ approveGrant: mocks.approve }))

import { MissingGrantMaterialError, useApproveGrant } from './use-approve-grant'
import { NOTIFICATIONS_CACHE_SUMMARY_KEY } from '../../shared/lib/pending-grant-notification-reconciliation'

const notificationsListQueryKey = (category: string) =>
  ['notifications', 'list', category] as const

interface NotificationsSummary {
  unreadCount: number
  pendingActionCount: number
}

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function queryClient() {
  return new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } })
}

const granularInput = {
  grantId: '77777777-7777-4777-8777-777777777777',
  vaultId: '22222222-2222-4222-8222-222222222222',
  entryId: '33333333-3333-4333-8333-333333333333',
  agentId: '55555555-5555-4555-8555-555555555555',
  type: 'granular' as const,
  policy: { queryLimit: 3 } as const,
  methods: ['get', 'inject'] as const,
  fieldIds: ['credential.username', 'credential.password'],
  reviewedEntryRevision: '7',
  requestedMethods: 5,
}

describe('useApproveGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getVault.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      memberVaultKey: {},
      memberKeyGeneration: 4,
    })
    mocks.getEntry.mockResolvedValue({
      organizationId: '11111111-1111-4111-8111-111111111111',
      currentRevision: '7',
      state: 'active',
      entryKey: {},
      memberSecret: {},
    })
    mocks.getAgent.mockResolvedValue({
      publicKey: 'agent-public-key',
      recipientKeyVersion: 3,
      accessEpoch: 2,
    })
    mocks.buildEnvelope.mockResolvedValue({ descriptor: { purpose: 'grantPayload' } })
    mocks.buildScriptPackage.mockResolvedValue({
      contractVersion: 1,
      scriptRevision: '7',
      encodedPackageCiphertext: 'sealed-script-package',
    })
    mocks.approve.mockResolvedValue(undefined)
  })

  it('does not approve after the Member session changes during the final revision check', async () => {
    const detail = await mocks.getEntry()
    mocks.getEntry.mockResolvedValueOnce(detail).mockImplementationOnce(async () => {
      mocks.privateKey = new Uint8Array(32)
      return detail
    })
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(queryClient()) })
    await expect(result.current.mutateAsync({ ...granularInput, methods: [...granularInput.methods] })).rejects.toThrow()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalled()
  })

  it('approves the exact reviewed GRANULAR scope using the current producer contract', async () => {
    const client = queryClient()
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(client) })

    await result.current.mutateAsync({ ...granularInput, methods: [...granularInput.methods] })

    expect(mocks.buildEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      grantId: granularInput.grantId,
      entryRevision: '7',
      memberKeyGeneration: 4,
      recipientKeyVersion: 3,
      approvedMethods: 5,
      approvedFieldIds: ['credential.password', 'credential.username'],
      remainingUses: 3,
    }))
    expect(mocks.approve).toHaveBeenCalledWith(granularInput.vaultId, granularInput.grantId, {
      grantEntry: { descriptor: { purpose: 'grantPayload' } },
      fieldSelectionMode: 'all',
      queryLimit: 3,
      methods: 'Get, Inject',
    })
    expect(mocks.getEntry).toHaveBeenCalledTimes(2)
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })

  it('encrypts only the owner-selected fields and records selected intent', async () => {
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(queryClient()) })
    await result.current.mutateAsync({ ...granularInput, methods: [...granularInput.methods],
      fieldSelectionMode: 'selected', fieldIds: ['credential.password'] })
    expect(mocks.buildEnvelope).toHaveBeenCalledWith(expect.objectContaining({ approvedFieldIds: ['credential.password'] }))
    expect(mocks.approve).toHaveBeenCalledWith(granularInput.vaultId, granularInput.grantId,
      expect.objectContaining({ fieldSelectionMode: 'selected' }))
  })

  it('rejects approval of a legacy pending credit-card grant before sealing', async () => {
    mocks.openMemberSecret.mockResolvedValueOnce({ schemaVersion: 1, entryType: 'creditCard' })
    const client = queryClient()
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(client) })

    await expect(result.current.mutateAsync({
      ...granularInput,
      methods: [...granularInput.methods],
    })).rejects.toBeInstanceOf(MissingGrantMaterialError)

    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing reviewed field', ['credential.password']],
    ['broadened reviewed field', ['credential.password', 'credential.username', 'credential.url']],
    ['duplicate reviewed field', ['credential.password', 'credential.password']],
  ])('rejects %s instead of silently changing the approved field contract', async (_name, fieldIds) => {
    const client = queryClient()
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(client) })

    await expect(result.current.mutateAsync({
      ...granularInput,
      methods: [...granularInput.methods],
      fieldIds,
    })).rejects.toBeInstanceOf(MissingGrantMaterialError)

    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })

  it('rejects methods outside the authenticated request before opening key material', async () => {
    const client = queryClient()
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(client) })

    await expect(result.current.mutateAsync({
      ...granularInput,
      methods: ['get', 'inject'],
      requestedMethods: 1,
    })).rejects.toBeInstanceOf(MissingGrantMaterialError)

    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.approve).not.toHaveBeenCalled()
  })

  it('approves one ScriptExecution package with Exec only', async () => {
    const client = queryClient()
    client.setQueryData(notificationsListQueryKey('all'), {
      pages: [{
        items: [{ type: 'grant_pending', metadata: { grantId: '33333333-3333-4333-8333-333333333333' } }],
        nextCursor: null,
      }],
      pageParams: [undefined],
    })
    client.setQueryData<NotificationsSummary>(NOTIFICATIONS_CACHE_SUMMARY_KEY, {
      unreadCount: 1,
      pendingActionCount: 1,
    })
    const { result } = renderHook(() => useApproveGrant(), { wrapper: wrapper(client) })

    await result.current.mutateAsync({
      grantId: '33333333-3333-4333-8333-333333333333',
      vaultId: '22222222-2222-4222-8222-222222222222',
      entryId: '55555555-5555-4555-8555-555555555555',
      agentId: '44444444-4444-4444-8444-444444444444',
      type: 'scriptExecution',
      policy: { queryLimit: 3 },
      methods: ['exec'],
      fieldIds: [],
      reviewedEntryRevision: '7',
      requestedMethods: 2,
    })

    expect(mocks.buildScriptPackage).toHaveBeenCalledWith(expect.objectContaining({
      grantId: '33333333-3333-4333-8333-333333333333',
      scriptEntryId: '55555555-5555-4555-8555-555555555555',
      agentAccessEpoch: 2,
      recipientAgentKeyVersion: 3,
      packageRevision: '1',
    }))
    expect(mocks.approve).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      expect.objectContaining({
        methods: 'Exec',
        queryLimit: 3,
        scriptPackage: expect.objectContaining({ encodedPackageCiphertext: 'sealed-script-package' }),
      }),
    )
    expect(mocks.approve.mock.calls[0][2].grantEntry).toBeUndefined()
    expect(mocks.openMemberSecret).not.toHaveBeenCalled()
    expect(mocks.buildEnvelope).not.toHaveBeenCalled()
    expect(mocks.wipe).toHaveBeenCalled()
    expect(client.getQueryData<{ pages: { items: unknown[] }[] }>(notificationsListQueryKey('all'))
      ?.pages[0].items).toEqual([])
    expect(client.getQueryData<NotificationsSummary>(NOTIFICATIONS_CACHE_SUMMARY_KEY)
      ?.pendingActionCount).toBe(0)
  })
})
