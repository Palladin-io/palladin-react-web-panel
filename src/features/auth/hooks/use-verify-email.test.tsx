import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../../../shared/api/types'
import { captureAuthenticatedSession } from '../session/session-boundary'
import { useAuthStore } from '../stores/auth-store'
import { useVerifyEmail } from './use-verify-email'

const mocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  getAccountForSession: vi.fn(),
}))

vi.mock('../api/auth-api', () => ({ verifyEmail: mocks.verifyEmail }))
vi.mock('../../../shared/api/account-api', () => ({
  ACCOUNT_QUERY_KEY: ['account'],
  getAccountForSession: mocks.getAccountForSession,
}))

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, org_id: organizationId })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: false,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })}>
      {children}
    </QueryClientProvider>
  )
}

describe('useVerifyEmail session ownership', () => {
  beforeEach(() => {
    mocks.verifyEmail.mockReset()
    mocks.getAccountForSession.mockReset()
    useAuthStore.getState().logout()
  })

  it('does not let verification started by A mark replacement session B', async () => {
    let completeVerification!: () => void
    mocks.verifyEmail.mockImplementationOnce(() => new Promise<void>((resolve) => {
      completeVerification = resolve
    }))
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const { result } = renderHook(() => useVerifyEmail(), { wrapper })

    act(() => result.current.mutate('token-for-a'))
    await waitFor(() => expect(mocks.verifyEmail).toHaveBeenCalledWith('token-for-a'))
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    completeVerification()

    await waitFor(() => expect(result.current.data).toBe('verified'))
    expect(mocks.getAccountForSession).not.toHaveBeenCalled()
    expect(useAuthStore.getState()).toMatchObject({
      userId: 'user-b',
      emailVerified: false,
    })
  })

  it('marks only the current owner after a bound account confirmation', async () => {
    mocks.verifyEmail.mockResolvedValue({ status: 'verified' })
    mocks.getAccountForSession.mockResolvedValue({
      userId: 'user-a',
      email: 'a@example.com',
      displayName: 'A',
      avatarUrl: null,
      isOnboarded: true,
      emailVerified: true,
    })
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const expected = captureAuthenticatedSession()
    const { result } = renderHook(() => useVerifyEmail(), { wrapper })

    act(() => result.current.mutate('token-for-a'))

    await waitFor(() => expect(result.current.data).toBe('verified'))
    expect(mocks.getAccountForSession).toHaveBeenCalledWith(expected)
    expect(useAuthStore.getState().emailVerified).toBe(true)
  })

  it('does not mark the owner when the confirmation response names another user', async () => {
    mocks.verifyEmail.mockResolvedValue({ status: 'verified' })
    mocks.getAccountForSession.mockResolvedValue({
      userId: 'user-b',
      email: 'b@example.com',
      displayName: 'B',
      avatarUrl: null,
      isOnboarded: true,
      emailVerified: true,
    })
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    const { result } = renderHook(() => useVerifyEmail(), { wrapper })

    act(() => result.current.mutate('token-for-a'))

    await waitFor(() => expect(result.current.data).toBe('verified'))
    expect(useAuthStore.getState().emailVerified).toBe(false)
  })
})
