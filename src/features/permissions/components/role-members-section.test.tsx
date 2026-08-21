import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationMember } from '../../../shared/api/organization-members-api'
import type { OrganizationRole } from '../../../shared/api/organization-roles-api'
import { RoleMembersSection } from './role-members-section'

const mocks = vi.hoisted(() => ({
  members: vi.fn(),
  remove: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  hasApiErrorKey: vi.fn(),
}))

vi.mock('../use-role-members', () => ({
  useRoleMembers: () => mocks.members(),
  useRemoveRoleFromMember: () => mocks.remove(),
}))
vi.mock('../../../shared/api/error-response', () => ({
  hasApiErrorKey: (...args: unknown[]) => mocks.hasApiErrorKey(...args),
}))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))

const role: OrganizationRole = {
  id: 'role-auditor',
  name: 'Auditor',
  permissions: 128,
  isSystem: false,
  canAssign: true,
  assignedMemberCount: 2,
}

const secondaryRole: OrganizationRole = {
  id: 'role-user',
  name: 'User',
  permissions: 12,
  isSystem: true,
  canAssign: true,
  assignedMemberCount: 1,
}

function member(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    userId: 'user-1',
    displayName: 'Alice Morgan',
    email: 'alice@example.com',
    publicKey: null,
    roles: [role, secondaryRole],
    effectivePermissions: 140,
    isOwner: false,
    joinedAt: '2026-08-20T10:00:00Z',
    status: 'Active',
    ...overrides,
  }
}

describe('RoleMembersSection', () => {
  beforeEach(() => {
    mocks.mutate.mockReset()
    mocks.refetch.mockReset()
    mocks.success.mockReset()
    mocks.error.mockReset()
    mocks.hasApiErrorKey.mockReset()
    mocks.members.mockReturnValue({
      data: [member(), member({ userId: 'user-2', displayName: 'Not assigned', roles: [secondaryRole] })],
      isPending: false,
      isError: false,
      refetch: mocks.refetch,
    })
    mocks.remove.mockReturnValue({ mutate: mocks.mutate, isPending: false })
  })

  it('shows only members assigned to the selected role', () => {
    render(<RoleMembersSection role={role} canManage callerPermissions={255} />)

    expect(screen.getByText('Alice Morgan')).toBeInTheDocument()
    expect(screen.queryByText('Not assigned')).not.toBeInTheDocument()
  })

  it('removes only the selected role and preserves the member other roles', async () => {
    const user = userEvent.setup()
    mocks.mutate.mockImplementation((_input, options) => options.onSuccess())
    render(<RoleMembersSection role={role} canManage callerPermissions={255} />)

    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(mocks.mutate).toHaveBeenCalledWith(
      { userId: 'user-1', roleIds: ['role-user'] },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining('Alice Morgan'))
  })

  it('does not allow removing an owner or a member last role', () => {
    mocks.members.mockReturnValue({
      data: [
        member({ userId: 'owner', displayName: 'Owner', isOwner: true }),
        member({ userId: 'single', displayName: 'Single role', roles: [role] }),
      ],
      isPending: false,
      isError: false,
      refetch: mocks.refetch,
    })

    render(<RoleMembersSection role={role} canManage callerPermissions={255} />)

    expect(screen.getAllByText('Owner')).toHaveLength(2)
    expect(screen.getByText('Assign another role before removing this one.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })
})
