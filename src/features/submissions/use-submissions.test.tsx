import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubmissionListItem } from './api/submissions-api'

const mocks = vi.hoisted(() => ({
  auth: { permissions: 32, privateKey: new Uint8Array(32) as Uint8Array | null, cryptoSessionGeneration: 1 },
  getSubmission: vi.fn(),
  loadOwnApproverKeys: vi.fn(),
  openSubmissionAsApprover: vi.fn(),
  getOrgGrants: vi.fn(),
  listSubmissions: vi.fn(),
  denySubmission: vi.fn(),
  restoreSubmission: vi.fn(),
  approveAsNewEntry: vi.fn(),
}))
vi.mock('./submission-approval', () => ({ approveAsNewEntry: mocks.approveAsNewEntry, approveAsUpdate: vi.fn() }))

vi.mock('../auth', () => ({ useAuthStore: (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth) }))
vi.mock('./api/submissions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/submissions-api')>()),
  getSubmission: mocks.getSubmission,
  listSubmissions: mocks.listSubmissions,
  denySubmission: mocks.denySubmission,
  restoreSubmission: mocks.restoreSubmission,
}))
vi.mock('./approver-keys', () => ({ loadOwnApproverKeys: mocks.loadOwnApproverKeys }))
vi.mock('../../shared/crypto/agent-submission', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/crypto/agent-submission')>()),
  openSubmissionAsApprover: mocks.openSubmissionAsApprover,
}))
vi.mock('../grants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../grants')>()),
  getOrgGrants: mocks.getOrgGrants,
}))

import { act } from '@testing-library/react'
import { useApproveSubmission, useDenySubmission, useExistingAgentAccess, useRestoreSubmission, useSubmissionReview, useSubmissions } from './use-submissions'

const AGENT = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'
const item: SubmissionListItem = {
  submissionId: '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d', agentId: AGENT, agentName: 'Bot', submissionKind: 1, entryType: 1,
  target: { kind: 'new' }, suggestedVaultId: null, state: 'pending', agentUseSuspended: false, createdAt: '', approverKeyVersion: 1,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { permissions: 32, privateKey: new Uint8Array(32), cryptoSessionGeneration: 1 }
})

describe('useSubmissionReview', () => {
  it('verifies with the JWT organization, the requested submission, the listed Agent and its directory key, then wipes the approver keys', async () => {
    const keys = { keyVersion: 1, messagePrivateKey: new Uint8Array(32).fill(4), signingSeed: new Uint8Array(32).fill(5) }
    mocks.loadOwnApproverKeys.mockResolvedValue({ keys, authority: { organizationId: 'org' } })
    mocks.getSubmission.mockResolvedValue({ submission: { s: 1 }, agentEd25519PublicKey: 'AQID', agentEd25519KeyVersion: 2 })
    mocks.openSubmissionAsApprover.mockResolvedValue({ content: { password: 'x' } })
    const { result } = renderHook(() => useSubmissionReview(item), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mocks.openSubmissionAsApprover).toHaveBeenCalledWith({ s: 1 }, {
      organizationId: 'org', submissionId: item.submissionId, agentId: AGENT, agentEd25519PublicKey: new Uint8Array([1, 2, 3]), approverKeys: keys,
    })
    expect(keys.messagePrivateKey.every((byte) => byte === 0)).toBe(true)
    expect(keys.signingSeed.every((byte) => byte === 0)).toBe(true)
  })

  it('does not open anything while locked or for a trashed submission', async () => {
    mocks.auth.privateKey = null
    renderHook(() => useSubmissionReview(item), { wrapper })
    mocks.auth.privateKey = new Uint8Array(32)
    renderHook(() => useSubmissionReview({ ...item, state: 'trashed' }), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mocks.getSubmission).not.toHaveBeenCalled()
  })
})

describe('useExistingAgentAccess', () => {
  const grant = (type: string, entryId?: string) => ({
    agentId: AGENT, vaultId: 'v1', type, entryScopes: entryId ? [{ entryId }] : [],
  })

  it('finds FULL coverage on a later page', async () => {
    mocks.getOrgGrants
      .mockResolvedValueOnce({ items: [grant('granular', 'other')], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [grant('full')], nextCursor: null })
    const { result } = renderHook(() => useExistingAgentAccess(AGENT, 'v1', 'e1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('full'))
    expect(mocks.getOrgGrants).toHaveBeenLastCalledWith({ agentId: AGENT, vaultId: 'v1', status: 'active', cursor: 'c2', pageSize: 100 })
  })

  it('treats a GRANULAR grant as coverage only for the exact target Entry', async () => {
    mocks.getOrgGrants.mockResolvedValue({ items: [grant('granular', 'e1')], nextCursor: null })
    const update = renderHook(() => useExistingAgentAccess(AGENT, 'v1', 'e1'), { wrapper })
    await waitFor(() => expect(update.result.current.data).toBe('entry'))
    const created = renderHook(() => useExistingAgentAccess(AGENT, 'v1'), { wrapper })
    await waitFor(() => expect(created.result.current.data).toBe('none'))
  })
})

describe('submission lists after a decision', () => {
  it('does not request submissions for members without GrantManage', async () => {
    mocks.auth.permissions = 0
    renderHook(() => useSubmissions('pending'), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mocks.listSubmissions).not.toHaveBeenCalled()
  })

  it('removes an approved submission from the pending list', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const local = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    mocks.listSubmissions.mockResolvedValueOnce([item]).mockResolvedValue([])
    mocks.approveAsNewEntry.mockResolvedValue({ submissionId: item.submissionId, vaultId: 'v', entryId: 'e', entryRevision: '1', grantId: null })
    const list = renderHook(() => useSubmissions('pending'), { wrapper: local })
    await waitFor(() => expect(list.result.current.data).toEqual([item]))
    const approve = renderHook(() => useApproveSubmission(), { wrapper: local })
    await act(() => approve.result.current.mutateAsync({
      kind: 'new', submissionId: item.submissionId, vaultId: 'v', label: 'L', payload: {} as never,
    }))
    await waitFor(() => expect(list.result.current.data).toEqual([]))
  })

  it.each([
    ['deny', useDenySubmission, 'denySubmission'],
    ['restore', useRestoreSubmission, 'restoreSubmission'],
  ] as const)('refetches pending and trashed lists after %s', async (_name, useDecision, api) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const local = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    mocks.listSubmissions.mockResolvedValue([])
    mocks[api].mockResolvedValue(undefined)
    renderHook(() => [useSubmissions('pending'), useSubmissions('trashed')], { wrapper: local })
    await waitFor(() => expect(mocks.listSubmissions).toHaveBeenCalledTimes(2))
    const decision = renderHook(() => useDecision(), { wrapper: local })
    await act(() => decision.result.current.mutateAsync(item.submissionId))
    await waitFor(() => expect(mocks.listSubmissions).toHaveBeenCalledTimes(4))
    expect(mocks.listSubmissions.mock.calls.map(([state]) => state).sort()).toEqual(['pending', 'pending', 'trashed', 'trashed'])
  })
})
