import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationRole } from '../../../shared/api/organization-roles-api'
import type { OrganizationMember } from '../api/team-members-api'
import { TeamMemberDetail } from './team-member-detail'

const mutateMock = vi.fn()
const hasApiErrorKeyMock = vi.fn()
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))
vi.mock('../use-update-member-roles', () => ({
  useUpdateMemberRoles: () => ({ mutate: mutateMock, isPending: false }),
}))
vi.mock('../../../shared/api/error-response', () => ({
  hasApiErrorKey: (...args: unknown[]) => hasApiErrorKeyMock(...args),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

const auditor: OrganizationRole = {
  id: 'auditor',
  name: 'Auditor',
  permissions: 128,
  isSystem: false,
  canAssign: true,
  assignedMemberCount: 1,
}
const grantManager: OrganizationRole = {
  id: 'grants',
  name: 'Grant manager',
  permissions: 32,
  isSystem: false,
  canAssign: true,
  assignedMemberCount: 0,
}
const systemUser: OrganizationRole = {
  id: 'system-user',
  name: 'User',
  permissions: 12,
  isSystem: true,
  canAssign: true,
  assignedMemberCount: 0,
}
const member: OrganizationMember = {
  userId: 'member-1',
  displayName: 'Alice Morgan',
  email: 'alice@example.com',
  publicKey: null,
  roles: [auditor],
  effectivePermissions: 128,
  isOwner: false,
  joinedAt: '2026-08-17T10:00:00Z',
  status: 'Active',
}

describe('TeamMemberDetail', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    hasApiErrorKeyMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('renders the member and available roles', () => {
    render(<TeamMemberDetail member={member} hasSelection roles={[auditor, grantManager]} isLoading={false} isError={false} canManage callerPermissions={160} onRetry={vi.fn()} />)
    expect(screen.getByText('Alice Morgan')).toBeInTheDocument()
    expect(screen.getByText('Joined').nextElementSibling).toHaveClass('text-right')
    expect(screen.getByText('Assigned roles').nextElementSibling).toHaveClass('text-right')
    expect(screen.getByText('Status').nextElementSibling).toHaveClass('text-right')
    fireEvent.click(screen.getByRole('tab', { name: 'Roles' }))
    expect(screen.getByRole('checkbox', { name: /auditor/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /auditor/i })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /grant manager/i })).not.toBeChecked()
  })

  it('reports the actual permission count for non-administrator system roles', () => {
    render(<TeamMemberDetail member={member} hasSelection roles={[systemUser]} isLoading={false} isError={false} canManage callerPermissions={160} onRetry={vi.fn()} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Roles' }))

    expect(screen.getByText('2 permissions')).toBeInTheDocument()
    expect(screen.queryByText('All current and future permissions')).not.toBeInTheDocument()
  })

  it('keeps non-delegable assigned and unassigned roles visible but locked', () => {
    render(
      <TeamMemberDetail
        member={{ ...member, roles: [{ ...auditor, canAssign: false }] }}
        hasSelection
        roles={[
          { ...auditor, canAssign: false },
          { ...grantManager, canAssign: false },
        ]}
        isLoading={false}
        isError={false}
        canManage
        callerPermissions={160}
        onRetry={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Roles' }))
    expect(screen.getByRole('checkbox', { name: /auditor/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /auditor/i })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /grant manager/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /grant manager/i })).toBeDisabled()
    expect(screen.getAllByText(/beyond your delegated authority/i)).toHaveLength(2)
  })

  it('locks the complete editor when the member has permissions above the caller', () => {
    render(
      <TeamMemberDetail
        member={{ ...member, effectivePermissions: 160 }}
        hasSelection
        roles={[auditor, grantManager]}
        isLoading={false}
        isError={false}
        canManage
        callerPermissions={128}
        onRetry={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Roles' }))
    expect(screen.getByRole('checkbox', { name: /auditor/i })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /grant manager/i })).toBeDisabled()
    expect(screen.getByText(/effective permissions beyond your delegated authority/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('replaces the member role set on save', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess())
    render(<TeamMemberDetail member={member} hasSelection roles={[auditor, grantManager]} isLoading={false} isError={false} canManage callerPermissions={160} onRetry={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Roles' }))
    await user.click(screen.getByRole('checkbox', { name: /grant manager/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(mutateMock.mock.calls[0][0]).toEqual({ userId: 'member-1', roleIds: ['auditor', 'grants'] })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('keeps selected roles after the fail-closed GrantManage conflict', async () => {
    const user = userEvent.setup()
    hasApiErrorKeyMock.mockResolvedValue(true)
    mutateMock.mockImplementation((_input, options) => options.onError(new Error('409')))
    render(<TeamMemberDetail member={member} hasSelection roles={[auditor, grantManager]} isLoading={false} isError={false} canManage callerPermissions={160} onRetry={vi.fn()} />)
    await user.click(screen.getByRole('tab', { name: 'Roles' }))
    await user.click(screen.getByRole('checkbox', { name: /grant manager/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/temporarily blocked/i))
    expect(screen.getByRole('checkbox', { name: /grant manager/i })).toBeChecked()
  })
})
