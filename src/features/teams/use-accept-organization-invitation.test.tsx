import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAcceptOrganizationInvitation } from './use-accept-organization-invitation'
import { captureAuthenticatedSession } from '../auth/session/session-boundary'

const acceptMock = vi.hoisted(() => vi.fn())
const replaceSessionMock = vi.hoisted(() => vi.fn())

vi.mock('./api/organization-invitations-api', () => ({
  acceptOrganizationInvitation: acceptMock,
}))
vi.mock('../notifications', () => ({
  clearPushTokenOnLogout: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../auth/session/session-boundary', async (importOriginal) => ({
  ...await importOriginal<typeof import('../auth/session/session-boundary')>(),
  replaceAuthenticatedSession: replaceSessionMock,
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
    replaceSessionMock.mockReset().mockImplementation(async () => (
      captureAuthenticatedSession()
    ))
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

    expect(acceptMock).toHaveBeenCalledWith('opaque-token')
    expect(replaceSessionMock).toHaveBeenCalledWith(session, {
      expectedSession: expect.objectContaining({ sessionGeneration: expect.any(Number) }),
      lockVault: true,
    })
  })
})
