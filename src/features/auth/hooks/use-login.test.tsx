import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogin } from './use-login'

const navigateMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const oauthGoogleMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('../api/auth-api', () => ({
  oauthGoogle: oauthGoogleMock,
}))

vi.mock('../stores/auth-store', () => ({
  useAuthStore: (
    selector: (state: { setTokens: typeof setTokensMock }) => unknown,
  ) => selector({ setTokens: setTokensMock }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useLogin', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    setTokensMock.mockReset()
    oauthGoogleMock.mockReset()
  })

  it('returns to the requested deep link after Google login', async () => {
    const response = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-id',
      isOnboarded: true,
    }
    oauthGoogleMock.mockResolvedValue(response)

    const { result } = renderHook(
      () => useLogin('/vaults/vault-1/entries/entry-1?tab=logs#history'),
      { wrapper },
    )

    act(() => result.current.mutate('google-access-token'))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(setTokensMock).toHaveBeenCalledWith(response)
    expect(navigateMock).toHaveBeenCalledWith({
      href: '/vaults/vault-1/entries/entry-1?tab=logs#history',
    })
  })
})
