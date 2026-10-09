import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAcceptOrganizationInvitation } from './use-accept-organization-invitation'

const lifecycle = vi.hoisted(() => ({ generation: 0 }))
const revokeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const acceptMock = vi.hoisted(() => vi.fn())
const setTokensMock = vi.hoisted(() => vi.fn())
const lockVaultMock = vi.hoisted(() => vi.fn())
const clearClientSessionMock = vi.hoisted(() => vi.fn())

vi.mock('./api/organization-invitations-api', () => ({
  acceptOrganizationInvitation: acceptMock,
}))

vi.mock('../auth', () => ({
  clearClientSession: clearClientSessionMock,
  captureClientSessionGeneration: () => lifecycle.generation,
  clientSessionGenerationMatches: (generation: number) => generation === lifecycle.generation,
  revokeUninstalledLoginSession: revokeMock,
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
    clearClientSessionMock.mockReset().mockImplementation(async () => { lifecycle.generation++ })
    revokeMock.mockClear()
  })

  it('switches the session and locks old in-memory vault keys after acceptance', async () => {
    const session = {
      accessToken: 'access-token',
      sessionId: 'refresh-token',
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

    expect(acceptMock).toHaveBeenCalledWith('opaque-token')
    expect(clearClientSessionMock).toHaveBeenCalledOnce()
    expect(setTokensMock).toHaveBeenCalledWith(session)
    expect(lockVaultMock).toHaveBeenCalledOnce()
    expect(clearClientSessionMock.mock.invocationCallOrder[0])
      .toBeLessThan(setTokensMock.mock.invocationCallOrder[0])
  })
  it('discards an invitation session if another login wins while acceptance is pending', async () => {
    let respond!: (session: object) => void
    acceptMock.mockReturnValue(new Promise(resolve => { respond = resolve }))
    const { result } = renderHook(() => useAcceptOrganizationInvitation(), { wrapper: Wrapper })
    const pending = result.current.mutateAsync('opaque-token')
    const rejected = expect(pending).rejects.toThrow('changed')
    await vi.waitFor(() => expect(acceptMock).toHaveBeenCalledOnce())
    lifecycle.generation++
    respond({ accessToken: 'old-issued-access', sessionId: 'old-issued-session' })
    await rejected
    expect(setTokensMock).not.toHaveBeenCalled()
    expect(clearClientSessionMock).not.toHaveBeenCalled()
    expect(revokeMock).toHaveBeenCalledWith('old-issued-access')
  })

})
