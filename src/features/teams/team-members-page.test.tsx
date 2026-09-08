import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationMember } from './api/team-members-api'
import type { OrganizationInvitation } from './api/organization-invitations-api'
import { useAuthStore } from '../auth'
import { PERMISSION_ADD_USER } from '../../shared/lib/permissions'
import { TeamMembersPage } from './team-members-page'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: {
    children: ReactNode
    to: string
    params?: Record<string, string>
  }) => (
    <a href={Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to,
    )}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))

const refetch = vi.fn()
const invitationRefetch = vi.fn()
const organizationRefetch = vi.fn()
const cancelInvitation = vi.fn()
const resendInvitation = vi.fn()
const updateInvitationRole = vi.fn()
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

vi.mock('./use-team-roles', () => ({
  useTeamRoles: () => ({ data: { items: [] }, isPending: false, isError: false, refetch: vi.fn() }),
}))

const invitationRolesState = {
  data: [
    { id: 'role-user', name: 'User' },
    { id: 'role-vault-operator', name: 'Vault operator' },
  ],
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}

vi.mock('./use-invitation-roles', () => ({
  useInvitationRoles: () => invitationRolesState,
}))

const organizationState = {
  data: { orgId: 'org-1', name: 'Example', memberCount: 1, seatUsage: 1, seatLimit: 5 },
  isPending: false,
  isError: false,
  refetch: organizationRefetch,
}

const invitationsState: {
  data: OrganizationInvitation[] | undefined
  isPending: boolean
  isError: boolean
  refetch: typeof invitationRefetch
} = {
  data: [],
  isPending: false,
  isError: false,
  refetch: invitationRefetch,
}

vi.mock('../settings/use-org', () => ({
  useOrg: () => organizationState,
}))

vi.mock('./use-organization-invitations', () => ({
  useOrganizationInvitations: () => invitationsState,
  useCancelOrganizationInvitation: () => ({ mutate: cancelInvitation, isPending: false }),
  useResendOrganizationInvitation: () => ({ mutate: resendInvitation, isPending: false }),
  useUpdateOrganizationInvitationRole: () => ({ mutate: updateInvitationRole, isPending: false }),
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
      canAssign: true,
    },
    {
      id: 'role-security',
      name: 'Security reviewer',
      permissions: 136,
      isSystem: false,
      canAssign: true,
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
    invitationsState.data = []
    invitationsState.isPending = false
    invitationsState.isError = false
    organizationState.data = {
      orgId: 'org-1',
      name: 'Example',
      memberCount: 1,
      seatUsage: 1,
      seatLimit: 5,
    }
    organizationState.isPending = false
    organizationState.isError = false
    refetch.mockClear()
    invitationRefetch.mockClear()
    organizationRefetch.mockClear()
    cancelInvitation.mockReset()
    resendInvitation.mockReset()
    updateInvitationRole.mockReset()
    navigate.mockReset()
    useAuthStore.setState({ permissions: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('summarizes roles without rendering an unbounded tag list', () => {
    membersState.data = [owner]

    render(<TeamMembersPage />)

    const pageHeading = screen.getByRole('heading', { name: 'Team' })
    expect(pageHeading).toBeInTheDocument()
    expect(pageHeading.closest('header')).toHaveClass('h-10', 'mb-4', 'items-center')
    expect(screen.getByText('Alice Morgan')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('2 roles')).toBeInTheDocument()
    expect(screen.queryByText('Administrator')).not.toBeInTheDocument()
    expect(screen.queryByText('Security reviewer')).not.toBeInTheDocument()
    const ownerBadge = screen.getByText('Owner').closest('span')
    const ownerName = screen.getByText('Alice Morgan')
    expect(ownerBadge).toBeInTheDocument()
    expect(ownerBadge).toHaveClass('h-5', 'px-2', 'text-micro', 'font-semibold')
    expect(ownerBadge?.parentElement).toBe(ownerName.parentElement)
    expect(ownerBadge?.parentElement?.nextElementSibling).toHaveTextContent('alice@example.com')
    expect(screen.getByText(/Joined/).closest('span')).toHaveClass('text-micro')
    expect(screen.getByText('2 roles')).toHaveClass('text-micro')
    expect(document.querySelector('[data-icon="calendar_today"]')).toHaveAttribute(
      'style',
      expect.stringContaining('12px'),
    )
  })

  it('shows a scoped loading state while keeping the page header visible', () => {
    membersState.isPending = true

    render(<TeamMembersPage />)

    expect(screen.getByRole('heading', { name: 'Team' })).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Loading organization members' }),
    ).toBeInTheDocument()
  })

  it('shows the invitation action only with AddUser permission', () => {
    membersState.data = [owner]
    useAuthStore.setState({ permissions: PERMISSION_ADD_USER })

    render(<TeamMembersPage />)

    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
  })

  it('renders members and pending invitations in one list and allows cancellation', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T10:00:00Z'))
    membersState.data = [owner]
    invitationsState.data = [{
      id: 'invitation-1',
      email: 'pending@example.com',
      roleId: 'role-user',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T10:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T10:01:00Z',
    }]
    useAuthStore.setState({ permissions: PERMISSION_ADD_USER })

    render(<TeamMembersPage />)

    expect(screen.getByPlaceholderText('Search team')).toBeInTheDocument()
    expect(screen.queryByText('3 of 5 available')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Members' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pending invitations' })).not.toBeInTheDocument()
    expect(screen.getByText('pending@example.com')).toBeInTheDocument()
    expect(screen.getByText('User')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /pending@example.com/i })).toHaveAttribute(
      'href',
      '/settings/team/invitations/invitation-1',
    )
    const pendingBadge = screen.getByText('Pending').closest('span')
    const pendingEmail = screen.getByText('pending@example.com')
    expect(pendingBadge).toHaveClass('h-5', 'px-2', 'text-micro', 'font-semibold')
    expect(pendingBadge).toHaveClass('text-[var(--cv-info)]')
    expect(pendingBadge?.parentElement).toBe(pendingEmail.parentElement)
    const pendingLink = screen.getByRole('link', { name: /pending@example.com/i })
    const calendarIcon = pendingLink.querySelector('[data-icon="calendar_today"]')
    const scheduleIcon = pendingLink.querySelector('[data-icon="schedule"]')
    expect(calendarIcon).toHaveAttribute('style', expect.stringContaining('12px'))
    expect(calendarIcon).toHaveClass('shrink-0')
    expect(scheduleIcon).toHaveAttribute('style', expect.stringContaining('12px'))
    expect(within(pendingLink).getByText('Expires in 3 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('!h-6', '!px-2')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog', { name: 'Cancel invitation?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation' }))
    expect(cancelInvitation).toHaveBeenCalledWith('invitation-1', expect.any(Object))
  })

  it('searches the combined list and filters it by status', () => {
    membersState.data = [owner]
    invitationsState.data = [{
      id: 'invitation-1',
      email: 'pending@example.com',
      roleId: 'role-user',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T10:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T10:01:00Z',
    }]
    useAuthStore.setState({ permissions: PERMISSION_ADD_USER })

    render(<TeamMembersPage />)

    fireEvent.change(screen.getByPlaceholderText('Search team'), {
      target: { value: 'pending@example.com' },
    })
    expect(screen.queryByText('Alice Morgan')).not.toBeInTheDocument()
    expect(screen.getByText('pending@example.com')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Search team'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Members' }))

    expect(screen.getByText('Alice Morgan')).toBeInTheDocument()
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument()
  })

  it('clears the pending-only filter when AddUser is revoked', () => {
    membersState.data = [owner]
    invitationsState.data = [{
      id: 'invitation-1',
      email: 'pending@example.com',
      roleId: 'role-user',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T10:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T10:01:00Z',
    }]
    useAuthStore.setState({ permissions: PERMISSION_ADD_USER })

    render(<TeamMembersPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Status' }))
    fireEvent.click(screen.getByRole('option', { name: 'Pending invitations' }))
    expect(screen.queryByText('Alice Morgan')).not.toBeInTheDocument()

    act(() => useAuthStore.setState({ permissions: 0 }))

    expect(screen.getByText('Alice Morgan')).toBeInTheDocument()
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument()
  })

  it('shows pending invitation details, edits its role, and cancels from the detail panel', () => {
    membersState.data = [owner]
    invitationsState.data = [{
      id: 'invitation-1',
      email: 'pending@example.com',
      roleId: 'role-user',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T10:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T10:01:00Z',
    }]
    useAuthStore.setState({ permissions: PERMISSION_ADD_USER })
    cancelInvitation.mockImplementation((_id, options) => options.onSuccess())
    resendInvitation.mockImplementation((_id, options) => options.onSuccess())
    updateInvitationRole.mockImplementation((_input, options) => options.onSuccess())

    render(<TeamMembersPage invitationId="invitation-1" />)

    expect(screen.getByRole('heading', { name: 'pending@example.com' })).toBeInTheDocument()
    expect(screen.getByText('Invited by').nextElementSibling).toHaveTextContent('Alice Morgan')
    expect(screen.getByText('Sent').nextElementSibling).not.toBeEmptyDOMElement()
    expect(screen.getByText('Expires').nextElementSibling).not.toBeEmptyDOMElement()

    fireEvent.click(screen.getByRole('tab', { name: 'Roles' }))
    expect(screen.getByRole('radio', { name: 'User' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'Vault operator' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(updateInvitationRole).toHaveBeenCalledWith(
      { invitationId: 'invitation-1', roleId: 'role-vault-operator' },
      expect.any(Object),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'General' }))

    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    expect(resendInvitation).toHaveBeenCalledWith('invitation-1', expect.any(Object))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel invitation?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }))

    expect(cancelInvitation).toHaveBeenCalledWith('invitation-1', expect.any(Object))
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/team' })
  })

  it('hides invitation controls and leaves the detail route after AddUser is revoked', () => {
    membersState.data = [owner]
    invitationsState.data = [{
      id: 'invitation-1',
      email: 'pending@example.com',
      roleId: 'role-user',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T10:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T10:01:00Z',
    }]
    useAuthStore.setState({ permissions: PERMISSION_ADD_USER })

    render(<TeamMembersPage invitationId="invitation-1" />)
    expect(screen.getByRole('button', { name: 'Send again' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel invitation' }))
    expect(screen.getByRole('dialog', { name: 'Cancel invitation?' })).toBeInTheDocument()

    act(() => useAuthStore.setState({ permissions: 0 }))

    expect(screen.queryByRole('button', { name: 'Send again' })).not.toBeInTheDocument()
    expect(screen.queryByText('pending@example.com')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Cancel invitation?' })).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/team', replace: true })
  })

  it('renders guidance when the organization has no members', () => {
    membersState.data = []

    render(<TeamMembersPage />)

    expect(screen.getByText('No people or invitations yet')).toBeInTheDocument()
    expect(screen.getByText(/members and pending invitations will appear here/i)).toBeInTheDocument()
  })

  it('shows a safe error and retries the query', () => {
    membersState.isError = true

    render(<TeamMembersPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))

    expect(
      screen.getByText("We couldn't load the team list."),
    ).toBeInTheDocument()
    expect(refetch).toHaveBeenCalledOnce()
  })
})
