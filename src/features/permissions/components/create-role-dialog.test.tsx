import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateRoleDialog } from './create-role-dialog'

const mutateMock = vi.fn()
const navigateMock = vi.fn()
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('../use-role-mutations', () => ({
  useCreateRole: () => ({ mutate: mutateMock, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))

const permissions = [{ key: 'AuditView', value: 128, canAssign: true }]

describe('CreateRoleDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    navigateMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('renders the role form and permission choices', () => {
    render(<CreateRoleDialog open permissions={permissions} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Role name')).toBeInTheDocument()
    expect(screen.getByLabelText('Role name')).toHaveAttribute('maxLength', '100')
    expect(screen.getByRole('checkbox', { name: /view audit log/i })).toBeInTheDocument()
  })

  it('shows but disables permissions the caller cannot delegate', () => {
    render(
      <CreateRoleDialog
        open
        permissions={[{ key: 'OrganizationManagement', value: 2, canAssign: false }]}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('checkbox', { name: /manage organization/i })).toBeDisabled()
    expect(screen.getByText(/exceeds your delegated authority/i)).toBeInTheDocument()
  })

  it('creates a trimmed role and opens its detail', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({ id: 'role-1' }))
    const onClose = vi.fn()
    render(<CreateRoleDialog open permissions={permissions} onClose={onClose} />)

    await user.type(screen.getByLabelText('Role name'), '  Auditor  ')
    await user.click(screen.getByRole('checkbox', { name: /view audit log/i }))
    await user.click(screen.getByRole('button', { name: /^create role$/i }))

    expect(mutateMock.mock.calls[0][0]).toEqual({ name: 'Auditor', permissions: 128 })
    expect(toastSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/settings/permissions/$roleId',
      params: { roleId: 'role-1' },
    })
  })

  it('keeps the form value when creation fails', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_input, options) => options.onError(new Error('failed')))
    render(<CreateRoleDialog open permissions={permissions} onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Role name'), 'Auditor')
    await user.click(screen.getByRole('button', { name: /^create role$/i }))

    expect(toastError).toHaveBeenCalled()
    expect(screen.getByLabelText('Role name')).toHaveValue('Auditor')
  })
})
