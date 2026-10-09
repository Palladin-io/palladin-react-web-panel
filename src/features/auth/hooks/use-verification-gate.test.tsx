import { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVerificationGate } from './use-verification-gate'
import { useAuthStore } from '../stores/auth-store'
import { ACCOUNT_QUERY_KEY } from '../../../shared/api/account-api'

const api = vi.hoisted(() => ({ account: vi.fn(), refresh: vi.fn() }))
vi.mock('../../../shared/api/account-api', () => ({ ACCOUNT_QUERY_KEY: ['account'], getAccount: api.account }))
vi.mock('../api/auth-api', () => ({ refreshSession: api.refresh }))
let client: QueryClient
const verifiedAccount = { userId: 'recipient', email: 'synthetic@example.test', emailVerified: true }
const freshSession = { userId: 'recipient', accessToken: 'fresh-access', sessionId: 'fresh-refresh', isOnboarded: true, emailVerified: true }
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider> }

beforeEach(() => {
  vi.resetAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } })
  useAuthStore.getState().logout()
  useAuthStore.getState().setTokens({ userId: 'recipient', accessToken: 'old-access', sessionId: 'old-refresh', isOnboarded: true, emailVerified: false })
  api.account.mockResolvedValue(verifiedAccount)
  api.refresh.mockResolvedValue(freshSession)
})
afterEach(() => { cleanup(); client.clear(); focusManager.setFocused(undefined); vi.useRealTimers() })

describe('Verified account continuation gate', () => {
  it('refreshes current claims before reporting ready and preserves unlocked keys', async () => {
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(3), new Uint8Array(32).fill(4))
    const key = useAuthStore.getState().privateKey
    const { result } = renderHook(() => useVerificationGate(), { wrapper })
    await waitFor(() => expect(result.current.data?.ready).toBe(true))
    expect(api.refresh).toHaveBeenCalledExactlyOnceWith('old-refresh')
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'fresh-access', emailVerified: true, privateKey: key, isVaultLocked: false })
    expect(client.getQueryData(ACCOUNT_QUERY_KEY)).toEqual(verifiedAccount)
    expect(JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain('fresh-refresh')
  })

  it('does not mark verified or navigate while fresh claims are still pending', async () => {
    let resolve!: (session: typeof freshSession) => void
    api.refresh.mockReturnValue(new Promise((done) => { resolve = done }))
    const { result } = renderHook(() => useVerificationGate(), { wrapper })
    await waitFor(() => expect(api.refresh).toHaveBeenCalledOnce())
    expect(result.current.data?.ready).not.toBe(true)
    expect(useAuthStore.getState().emailVerified).toBe(false)
    await act(async () => { resolve(freshSession) })
    await waitFor(() => expect(result.current.data?.ready).toBe(true))
  })

  it('refreshes on focus even when the account was read less than five minutes ago', async () => {
    api.account.mockResolvedValueOnce({ ...verifiedAccount, emailVerified: false })
    const { result } = renderHook(() => useVerificationGate(), { wrapper })
    await waitFor(() => expect(result.current.data?.ready).toBe(false))
    expect(api.refresh).not.toHaveBeenCalled()
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true) })
    await waitFor(() => expect(result.current.data?.ready).toBe(true))
    expect(api.account).toHaveBeenCalledTimes(2)
  })

  it('keeps the session unverified on refresh failure and supports explicit retry', async () => {
    api.refresh.mockRejectedValue(new Error('network details must not enter the view'))
    const { result } = renderHook(() => useVerificationGate(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'old-access', emailVerified: false })
    api.refresh.mockResolvedValue(freshSession)
    await act(async () => { await result.current.refetch() })
    await waitFor(() => expect(result.current.data?.ready).toBe(true))
  })

  it.each(['logout', 'account', 'lock', 'refresh', 'unmount'] as const)('rejects late publication after %s', async (reason) => {
    let resolve!: (session: typeof freshSession) => void
    api.refresh.mockReturnValue(new Promise((done) => { resolve = done }))
    const hook = renderHook(() => useVerificationGate(), { wrapper })
    await waitFor(() => expect(api.refresh).toHaveBeenCalledOnce())
    api.account.mockResolvedValue({ ...verifiedAccount, emailVerified: false })
    act(() => {
      if (reason === 'logout') useAuthStore.getState().logout()
      else if (reason === 'account') useAuthStore.setState({ userId: 'replacement', accessToken: 'replacement-access' })
      else if (reason === 'lock') useAuthStore.getState().lockVault()
      else if (reason === 'refresh') useAuthStore.setState({ sessionId: 'replacement-refresh' })
    })
    if (reason === 'unmount') hook.unmount()
    const expected = useAuthStore.getState()
    await act(async () => { resolve(freshSession) })
    expect(useAuthStore.getState()).toEqual(expected)
    expect(client.getQueryData(ACCOUNT_QUERY_KEY)).toBeUndefined()
  })
})
