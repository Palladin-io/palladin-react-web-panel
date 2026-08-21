import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationRole } from '../../../shared/api/organization-roles-api'
import { RoleDetail } from './role-detail'

const updateMutateMock = vi.fn()
const deleteMutateMock = vi.fn()
const hasApiErrorKeyMock = vi.fn()
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('../use-role-mutations', () => ({
  useUpdateRole: () => ({ mutate: updateMutateMock, isPending: false }),
  useDeleteRole: () => ({ mutate: deleteMutateMock, isPending: false }),
}))
vi.mock('./role-members-section', () => ({
  RoleMembersSection: ({ role }: { role: OrganizationRole }) => (
    <div data-testid="role-members-section" data-role-id={role.id} />
  ),
}))
vi.mock('../../../shared/api/error-response', () => ({
  hasApiErrorKey: (...args: unknown[]) => hasApiErrorKeyMock(...args),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

const role: OrganizationRole = {
  id: 'role-1',
  name: 'Auditor',
  permissions: 128,
  isSystem: false,
  canAssign: true,
  assignedMemberCount: 1,
}
const assignable = [
  { key: 'AuditView', value: 128, canAssign: true },
  { key: 'GrantManage', value: 32, canAssign: true },
]

describe('RoleDetail', () => {
  beforeEach(() => {
    updateMutateMock.mockReset()
    deleteMutateMock.mockReset()
    hasApiErrorKeyMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('keeps Administrator identity and permissions read-only', async () => {
    const user = userEvent.setup()
    render(<RoleDetail role={{ ...role, name: 'Administrator', isSystem: true }} assignablePermissions={assignable} canManage callerPermissions={2_147_483_647} />)
    expect(screen.getByLabelText('Role name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete role$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Administrator' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Permissions' }))

    expect(screen.getByRole('checkbox', { name: /view audit log/i })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /manage grants/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('keeps the unfinished Vault access surface out of role details', () => {
    render(<RoleDetail role={role} assignablePermissions={assignable} canManage callerPermissions={255} />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'General',
      'Permissions',
      'Members (1)',
    ])
    expect(screen.queryByRole('tab', { name: 'Vaults' })).not.toBeInTheDocument()
  })

  it('shows assigned people only in the dedicated count tab', async () => {
    const user = userEvent.setup()
    render(<RoleDetail role={role} assignablePermissions={assignable} canManage callerPermissions={255} />)

    expect(screen.queryByText('Assigned to 1 member')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Members (1)' }))
    expect(screen.getByTestId('role-members-section')).toHaveAttribute('data-role-id', role.id)
  })

  it('disables every mutation for a role the caller cannot assign', async () => {
    const user = userEvent.setup()
    render(<RoleDetail role={{ ...role, canAssign: false }} assignablePermissions={assignable} canManage callerPermissions={255} />)

    expect(screen.getByLabelText('Role name')).toBeDisabled()
    expect(screen.getByLabelText('Role name')).toHaveAttribute('maxLength', '100')
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    expect(screen.getByRole('checkbox', { name: /view audit log/i })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: 'General' }))
    expect(screen.getByRole('button', { name: /^delete role$/i })).toBeDisabled()
    expect(screen.getByText(/cannot edit or delete/i)).toBeInTheDocument()
  })

  it('preserves an existing permission the caller cannot delegate while editing other fields', async () => {
    const user = userEvent.setup()
    render(
      <RoleDetail
        role={role}
        assignablePermissions={[
          { key: 'AuditView', value: 128, canAssign: false },
          { key: 'GrantManage', value: 32, canAssign: true },
        ]}
        canManage
        callerPermissions={255}
      />,
    )

    const name = screen.getByLabelText('Role name')
    await user.clear(name)
    await user.type(name, 'Security auditor')
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    expect(screen.getByRole('checkbox', { name: /view audit log/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /view audit log/i })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /manage grants/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock.mock.calls[0][0]).toEqual({
      roleId: 'role-1',
      input: { name: 'Auditor', permissions: 160 },
    })
  })

  it('saves edited role fields', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((input, options) => options.onSuccess({
      ...role,
      ...input.input,
    }))
    render(<RoleDetail role={role} assignablePermissions={assignable} canManage callerPermissions={255} />)
    const name = screen.getByLabelText('Role name')
    await user.clear(name)
    await user.type(name, 'Security auditor')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock.mock.calls[0][0]).toEqual({
      roleId: 'role-1',
      input: { name: 'Security auditor', permissions: 128 },
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('uses the latest saved role snapshot when saving another tab', async () => {
    const user = userEvent.setup()
    updateMutateMock.mockImplementation((input, options) => options.onSuccess({
      ...role,
      ...input.input,
    }))
    render(<RoleDetail role={role} assignablePermissions={assignable} canManage callerPermissions={255} />)

    const name = screen.getByLabelText('Role name')
    await user.clear(name)
    await user.type(name, 'Security auditor')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    await user.click(screen.getByRole('checkbox', { name: /manage grants/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock).toHaveBeenNthCalledWith(2, {
      roleId: 'role-1',
      input: { name: 'Security auditor', permissions: 160 },
    }, expect.any(Object))
  })

  it('keeps the draft and shows the precise fail-closed message on GrantManage conflict', async () => {
    const user = userEvent.setup()
    hasApiErrorKeyMock.mockResolvedValue(true)
    updateMutateMock.mockImplementation((_input, options) => options.onError(new Error('409')))
    render(<RoleDetail role={role} assignablePermissions={assignable} canManage callerPermissions={255} />)
    await user.click(screen.getByRole('tab', { name: 'Permissions' }))
    await user.click(screen.getByRole('checkbox', { name: /manage grants/i }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/temporarily blocked/i))
    expect(screen.getByRole('checkbox', { name: /manage grants/i })).toBeChecked()
  })
})
