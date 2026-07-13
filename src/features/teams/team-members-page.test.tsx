import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationMember } from './api/team-members-api'
import { TeamMembersPage } from './team-members-page'

const refetch = vi.fn()
const membersState: {
  data: OrganizationMember[] | undefined
  isPending: boolean
  isError: boolean
  refetch: typeof refetch
} = {
  data: undefined,
  isPending: false,
  isError: false,
  refetch,
}

vi.mock('./use-team-members', () => ({
  useTeamMembers: () => membersState,
}))

const owner: OrganizationMember = {
  userId: 'user-1',
  displayName: 'Alice Morgan',
  email: 'alice@example.com',
  publicKey: null,
  roles: [
    {
      id: 'role-admin',
      name: 'Administrator',
      permissions: 2_147_483_647,
      isSystem: true,
    },
    {
      id: 'role-security',
      name: 'Security reviewer',
      permissions: 136,
      isSystem: false,
    },
  ],
  effectivePermissions: 2_147_483_647,
  isOwner: true,
  joinedAt: '2026-07-12T10:00:00Z',
}

describe('TeamMembersPage', () => {
  beforeEach(() => {
    membersState.data = undefined
    membersState.isPending = false
    membersState.isError = false
    refetch.mockClear()
  })

  it('renders every dynamic role and marks the owner independently', () => {
    membersState.data = [owner]

    render(<TeamMembersPage />)

    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
    expect(screen.getByText('Alice Morgan')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('Security reviewer')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })

  it('shows a scoped loading state while keeping the page header visible', () => {
    membersState.isPending = true

    render(<TeamMembersPage />)

    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Loading organization members' }),
    ).toBeInTheDocument()
  })

  it('renders guidance when the organization has no members', () => {
    membersState.data = []

    render(<TeamMembersPage />)

    expect(screen.getByText('No members yet')).toBeInTheDocument()
    expect(screen.getByText(/invited people will appear here/i)).toBeInTheDocument()
  })

  it('shows a safe error and retries the query', () => {
    membersState.isError = true

    render(<TeamMembersPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(
      screen.getByText("We couldn't load the organization members."),
    ).toBeInTheDocument()
    expect(refetch).toHaveBeenCalledOnce()
  })
})
