import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inviteOrganizationMember } from './api/organization-invitations-api'
import { useInviteMembers } from './use-invite-members'

vi.mock('./api/organization-invitations-api')

const invite = vi.mocked(inviteOrganizationMember)

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })}
    >
      {children}
    </QueryClientProvider>
  )
}

describe('useInviteMembers', () => {
  beforeEach(() => invite.mockReset())

  it('returns per-address results without discarding successful invitations', async () => {
    invite
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('already invited'))
    const { result } = renderHook(() => useInviteMembers(), { wrapper })

    const response = await act(() => result.current.mutateAsync({
      emails: ['first@example.com', 'second@example.com'],
      roleId: 'role-1',
    }))

    expect(invite.mock.calls).toEqual([
      [{ email: 'first@example.com', roleId: 'role-1' }],
      [{ email: 'second@example.com', roleId: 'role-1' }],
    ])
    expect(response.succeeded).toEqual(['first@example.com'])
    expect(response.failed).toEqual([
      { email: 'second@example.com', error: expect.any(Error) },
    ])
  })
})
