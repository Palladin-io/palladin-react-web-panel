import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAcceptOrganizationInvitation } from './use-accept-organization-invitation'

const acceptMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const lockVaultMock = vi.hoisted(() => vi.fn())

vi.mock('./api/organization-invitations-api', () => ({
  acceptOrganizationInvitation: acceptMock,
}))

vi.mock('../auth', () => ({
  useAuthStore: {
    getState: () => ({ setTokens: setTokensMock, lockVault: lockVaultMock }),
  },
}))

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

describe('useAcceptOrganizationInvitation', () => {
  beforeEach(() => {
    acceptMock.mockReset()
    setTokensMock.mockReset()
    lockVaultMock.mockReset()
  })

  it('switches the session and locks old in-memory vault keys after acceptance', async () => {
    const session = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userId: 'user-1',
      isOnboarded: true,
      emailVerified: true,
    }
    acceptMock.mockResolvedValue(session)
    const { result } = renderHook(() => useAcceptOrganizationInvitation(), {
      wrapper: Wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync('opaque-token')
    })

    expect(acceptMock).toHaveBeenCalledWith('opaque-token', expect.any(Object))
    expect(setTokensMock).toHaveBeenCalledWith(session)
    expect(lockVaultMock).toHaveBeenCalledOnce()
  })
})
