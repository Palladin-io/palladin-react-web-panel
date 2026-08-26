import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useVerifyEmail } from './use-verify-email'

const verifyEmailMock = vi.hoisted(() => vi.fn())
const refreshAuthSessionMock = vi.hoisted(() => vi.fn())
const markEmailVerifiedMock = vi.hoisted(() => vi.fn())
const setWaitlistDeveloperBenefitMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({
  authenticated: true,
  userId: 'current-user',
  refreshToken: 'current-refresh',
}))

vi.mock('../api/auth-api', () => ({
  verifyEmail: verifyEmailMock,
  refreshToken: refreshAuthSessionMock,
}))

vi.mock('../stores/auth-store', () => ({
  getIsAuthenticated: () => authState.authenticated,
  useAuthStore: {
    getState: () => ({
      userId: authState.userId,
      refreshToken: authState.refreshToken,
      markEmailVerified: markEmailVerifiedMock,
      setWaitlistDeveloperBenefit: setWaitlistDeveloperBenefitMock,
      setTokens: setTokensMock,
    }),
  },
}))

vi.mock('../session/client-session', () => ({
  captureClientSessionGeneration: () => 7,
  clientSessionGenerationMatches: (generation: number) => generation === 7,
}))

let queryClient: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useVerifyEmail', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    })
    verifyEmailMock.mockReset()
    refreshAuthSessionMock.mockReset()
    markEmailVerifiedMock.mockReset()
    setWaitlistDeveloperBenefitMock.mockReset()
    setTokensMock.mockReset()
    authState.authenticated = true
    authState.userId = 'current-user'
    authState.refreshToken = 'current-refresh'
  })

  it('refreshes the matching session so the benefit plan applies immediately', async () => {
    verifyEmailMock.mockResolvedValue({
      status: 'verified',
      userId: 'current-user',
      waitlistDeveloperBenefitStartedAt: '2026-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2026-09-25T12:00:00Z',
    })
    const refreshed = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      userId: 'current-user',
      isOnboarded: true,
      emailVerified: true,
      waitlistDeveloperBenefitStartedAt: '2026-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2026-09-25T12:00:00Z',
    }
    refreshAuthSessionMock.mockResolvedValue(refreshed)
    const { result } = renderHook(() => useVerifyEmail(), { wrapper })

    act(() => result.current.mutate('verification-token'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(markEmailVerifiedMock).toHaveBeenCalledOnce()
    expect(setWaitlistDeveloperBenefitMock).toHaveBeenCalledWith(
      '2026-08-25T12:00:00Z',
      '2026-09-25T12:00:00Z',
    )
    expect(refreshAuthSessionMock).toHaveBeenCalledWith('current-refresh')
    expect(setTokensMock).toHaveBeenCalledWith(refreshed)
  })

  it('does not mutate a different account session opened in the same browser', async () => {
    verifyEmailMock.mockResolvedValue({
      status: 'verified',
      userId: 'other-user',
      waitlistDeveloperBenefitStartedAt: null,
      waitlistDeveloperBenefitEndsAt: null,
    })
    const { result } = renderHook(() => useVerifyEmail(), { wrapper })

    act(() => result.current.mutate('other-account-token'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(markEmailVerifiedMock).not.toHaveBeenCalled()
    expect(setWaitlistDeveloperBenefitMock).not.toHaveBeenCalled()
    expect(refreshAuthSessionMock).not.toHaveBeenCalled()
    expect(setTokensMock).not.toHaveBeenCalled()
  })

  it('keeps verification successful when the immediate session refresh fails', async () => {
    verifyEmailMock.mockResolvedValue({
      status: 'verified',
      userId: 'current-user',
      waitlistDeveloperBenefitStartedAt: '2026-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2026-09-25T12:00:00Z',
    })
    refreshAuthSessionMock.mockRejectedValue(new Error('temporary refresh failure'))
    const { result } = renderHook(() => useVerifyEmail(), { wrapper })

    act(() => result.current.mutate('verification-token'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe('verified')
    expect(markEmailVerifiedMock).toHaveBeenCalledOnce()
    expect(setWaitlistDeveloperBenefitMock).toHaveBeenCalledWith(
      '2026-08-25T12:00:00Z',
      '2026-09-25T12:00:00Z',
    )
    expect(setTokensMock).not.toHaveBeenCalled()
  })
})
