import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogin } from './use-login'
import { useAuthStore } from '../stores/auth-store'
import { beginManualUnlockAttempt } from '../session/manual-unlock-attempt'

const navigateMock = vi.hoisted(() => vi.fn())
const oauthGoogleMock = vi.hoisted(() => vi.fn())
const revokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('../api/auth-api', () => ({ oauthGoogle: oauthGoogleMock, revokeUninstalledLoginSession: revokeMock }))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
const sessionA = { accessToken: 'synthetic-access-a', sessionId: 'synthetic-refresh-a',
  userId: '11111111-1111-4111-8111-111111111111', isOnboarded: true }
const sessionB = { accessToken: 'synthetic-access-b', sessionId: 'synthetic-refresh-b',
  userId: '22222222-2222-4222-8222-222222222222', isOnboarded: true }
const input = () => {
  const attempt = beginManualUnlockAttempt({ blockNewSharedUnlock: true })
  return { googleToken: 'synthetic-google-token', assertCurrent: attempt.assertCurrent, finish: vi.fn(attempt.cancel) }
}
beforeEach(() => { useAuthStore.getState().logout(); vi.clearAllMocks(); revokeMock.mockResolvedValue(undefined) })
afterEach(() => { beginManualUnlockAttempt().cancel(); useAuthStore.getState().logout() })

describe('Google exchange ownership', () => {
  it('returns to the validated deep link after installing its own locked session', async () => {
    oauthGoogleMock.mockResolvedValue(sessionB)
    const request = input()
    const { result } = renderHook(() => useLogin('/vaults/vault-1?tab=logs#history'), { wrapper })
    await act(async () => { await result.current.mutateAsync(request) })
    expect(oauthGoogleMock).toHaveBeenCalledWith(request.googleToken)
    expect(useAuthStore.getState()).toMatchObject({ ...sessionB, isVaultLocked: true, masterKey: null, privateKey: null })
    expect(navigateMock).toHaveBeenCalledExactlyOnceWith({ href: '/vaults/vault-1?tab=logs#history' })
    expect(request.finish).toHaveBeenCalledOnce()
    expect(revokeMock).not.toHaveBeenCalled()
  })

  it('does not exchange a cancelled popup result', async () => {
    const request = input(); beginManualUnlockAttempt().cancel()
    const { result } = renderHook(() => useLogin(), { wrapper })
    await act(async () => { await expect(result.current.mutateAsync(request)).rejects.toThrow() })
    expect(oauthGoogleMock).not.toHaveBeenCalled()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(request.finish).toHaveBeenCalledOnce()
  })

  it('never combines a late account-B response with account-A keys and revokes only that unused response', async () => {
    let resolve!: (value: typeof sessionB) => void
    oauthGoogleMock.mockReturnValue(new Promise(r => { resolve = r }))
    const request = input()
    const { result } = renderHook(() => useLogin(), { wrapper })
    let completion!: Promise<unknown>
    act(() => { completion = result.current.mutateAsync(request) })
    await waitFor(() => expect(oauthGoogleMock).toHaveBeenCalledOnce())
    const rejected = expect(completion).rejects.toThrow()
    act(() => {
      beginManualUnlockAttempt()
      useAuthStore.getState().setTokens(sessionA)
      useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2))
    })
    const ownKeys = useAuthStore.getState().masterKey
    await act(async () => { resolve(sessionB); await rejected })
    expect(useAuthStore.getState()).toMatchObject(sessionA)
    expect(useAuthStore.getState().masterKey).toBe(ownKeys)
    expect(ownKeys).toEqual(new Uint8Array(32).fill(1))
    expect(navigateMock).not.toHaveBeenCalled()
    expect(revokeMock).toHaveBeenCalledExactlyOnceWith(sessionB.accessToken)
    expect(request.finish).toHaveBeenCalledOnce()
  })

  it('resumes normal auth guards for a new OAuth account and preserves its destination', async () => {
    oauthGoogleMock.mockResolvedValue({ accessToken: 'access', sessionId: 'refresh', userId: 'new-user', isOnboarded: false, isNewUser: true })
    const { result } = renderHook(() => useLogin('/agent-pairing/opaque-handle'), { wrapper })
    await act(async () => { await result.current.mutateAsync(input()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(navigateMock).toHaveBeenCalledWith({ href: '/agent-pairing/opaque-handle' })
  })
})
