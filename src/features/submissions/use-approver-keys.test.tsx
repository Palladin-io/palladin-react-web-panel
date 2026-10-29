import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HTTPError } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import type { ApproverKeysResponse } from './api/submissions-api'

const mocks = vi.hoisted(() => ({
  auth: { permissions: 0, isVaultLocked: false, privateKey: new Uint8Array(32) as Uint8Array | null, cryptoSessionGeneration: 1 },
  getApproverKeys: vi.fn(),
  runApproverKeyChange: vi.fn(),
}))

vi.mock('../auth', () => ({
  useAuthStore: (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth),
}))
vi.mock('./api/submissions-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/submissions-api')>()),
  getApproverKeys: mocks.getApproverKeys,
}))
vi.mock('./approver-keys', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./approver-keys')>()),
  runApproverKeyChange: mocks.runApproverKeyChange,
}))

import { approverKeyPresentation, useApproverKeyMaintenance } from './use-approver-keys'

function state(overrides: Partial<ApproverKeysResponse> = {}): ApproverKeysResponse {
  return {
    status: 'ready', keyVersion: 1, approverSetRevision: '1',
    manifest: { manifestRevision: '1' } as ApproverKeysResponse['manifest'],
    myWraps: [{}, {}] as ApproverKeysResponse['myWraps'],
    approvers: [], approverSetDigest: 'd', rotationRequired: false,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const conflict = () => new HTTPError(new Response('{"code":"approver-keys-exist"}', { status: 409 }),
  new Request('http://localhost/api/approver-keys/bootstrap'), {} as never)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth = { permissions: PERMISSION_GRANT_MANAGE, isVaultLocked: false, privateKey: new Uint8Array(32), cryptoSessionGeneration: 1 }
})

describe('useApproverKeyMaintenance', () => {
  it('bootstraps an absent key set once after unlock and stops when the set becomes ready', async () => {
    mocks.getApproverKeys
      .mockResolvedValueOnce(state({ status: 'absent', manifest: null, myWraps: null }))
      .mockResolvedValue(state())
    mocks.runApproverKeyChange.mockResolvedValue(undefined)
    renderHook(() => useApproverKeyMaintenance(), { wrapper })
    await waitFor(() => expect(mocks.getApproverKeys).toHaveBeenCalledTimes(2))
    expect(mocks.runApproverKeyChange).toHaveBeenCalledTimes(1)
    expect(mocks.runApproverKeyChange.mock.calls[0][0]).toBe('bootstrap')
  })

  it('refetches after a lost race and retries the same observed state only a bounded number of times', async () => {
    mocks.getApproverKeys.mockResolvedValue(state({ status: 'absent', manifest: null, myWraps: null }))
    mocks.runApproverKeyChange.mockRejectedValue(conflict())
    renderHook(() => useApproverKeyMaintenance(), { wrapper })
    await waitFor(() => expect(mocks.runApproverKeyChange).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(mocks.getApproverKeys).toHaveBeenCalledTimes(4))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mocks.runApproverKeyChange).toHaveBeenCalledTimes(3)
  })

  it('never re-bootstraps an unavailable set automatically and stays idle while locked or unauthorized', async () => {
    mocks.getApproverKeys.mockResolvedValue(state({ status: 'unavailable', myWraps: [] }))
    renderHook(() => useApproverKeyMaintenance(), { wrapper })
    await waitFor(() => expect(mocks.getApproverKeys).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.runApproverKeyChange).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.auth = { ...mocks.auth, isVaultLocked: true, privateKey: null }
    renderHook(() => useApproverKeyMaintenance(), { wrapper })
    mocks.auth = { ...mocks.auth, isVaultLocked: false, privateKey: new Uint8Array(32), permissions: 0 }
    renderHook(() => useApproverKeyMaintenance(), { wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.getApproverKeys).not.toHaveBeenCalled()
  })
})

describe('approverKeyPresentation', () => {
  const idle = { isError: false, isMaintaining: false }
  it('maps the server state to what the reviewer can do', () => {
    expect(approverKeyPresentation(undefined, idle)).toBe('loading')
    expect(approverKeyPresentation(undefined, { ...idle, isError: true })).toBe('error')
    expect(approverKeyPresentation(state({ status: 'absent' }), idle)).toBe('settingUp')
    expect(approverKeyPresentation(state(), { ...idle, isMaintaining: true })).toBe('settingUp')
    expect(approverKeyPresentation(state({ rotationRequired: true }), idle)).toBe('settingUp')
    expect(approverKeyPresentation(state(), idle)).toBe('ready')
    expect(approverKeyPresentation(state({ myWraps: [] }), idle)).toBe('waiting')
    expect(approverKeyPresentation(state({ status: 'unavailable' }), idle)).toBe('unavailable')
    expect(approverKeyPresentation(state({ status: 'future' }), idle)).toBe('error')
  })
})
