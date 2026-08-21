import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InviteMemberDialog } from './invite-member-dialog'

const mutateMock = vi.fn()
const toastSuccess = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))

vi.mock('../use-invitation-roles', () => ({
  useInvitationRoles: () => ({
    data: [{ id: 'role-1', name: 'Auditor' }],
    isPending: false,
    isError: false,
  }),
}))
vi.mock('../use-invite-members', () => ({
  useInviteMembers: () => ({ mutate: mutateMock, isPending: false }),
}))
vi.mock('../../settings/use-org', () => ({
  useOrg: () => ({
    data: { orgId: 'org-1', name: 'Example', memberCount: 1, seatUsage: 2, seatLimit: 5 },
    isPending: false,
    isError: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

describe('InviteMemberDialog', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    toastSuccess.mockReset()
    navigateMock.mockReset()
  })

  it('sends normalized, de-duplicated emails with the selected safe role', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mutateMock.mockImplementation((input, options) => options.onSuccess({
      succeeded: input.emails,
      failed: [],
    }))
    render(<InviteMemberDialog open onClose={onClose} />)

    await user.type(
      screen.getByLabelText('Email addresses'),
      'PERSON@Example.com{Enter}second@example.com{Enter}person@example.com{Enter}',
    )
    await user.click(screen.getByRole('button', { name: 'Send invitations' }))

    expect(mutateMock.mock.calls[0][0]).toEqual({
      emails: ['person@example.com', 'second@example.com'],
      roleId: 'role-1',
    })
    expect(toastSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows remaining seats inside the invitation dialog', () => {
    render(<InviteMemberDialog open onClose={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Seats' })).toBeInTheDocument()
    expect(screen.getByText('2 of 5 seats used')).toBeInTheDocument()
    expect(screen.getByText('3 available')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '2 of 5 seats used' })).toHaveAttribute('aria-valuenow', '2')
  })

  it('closes the dialog and opens Billing from the compact seat action', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<InviteMemberDialog open onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Manage seats' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(navigateMock).toHaveBeenCalledWith({ to: '/settings/billing' })
  })

  it('keeps failed recipients in the dialog after a partial result', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mutateMock.mockImplementation((_input, options) => options.onSuccess({
      succeeded: ['first@example.com'],
      failed: [{ email: 'second@example.com', error: new Error('conflict') }],
    }))
    render(<InviteMemberDialog open onClose={onClose} />)

    await user.type(
      screen.getByLabelText('Email addresses'),
      'first@example.com{Enter}second@example.com{Enter}',
    )
    await user.click(screen.getByRole('button', { name: 'Send invitations' }))

    expect(screen.getByText('second@example.com')).toBeInTheDocument()
    expect(screen.queryByText('first@example.com')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows inline validation for an invalid address', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog open onClose={vi.fn()} />)

    const input = screen.getByLabelText('Email addresses')
    await user.type(input, 'not-an-email')
    await user.tab()

    expect(screen.getByText('Enter valid email addresses.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute(
      'aria-describedby',
      'invite-member-emails-error invite-member-emails-hint',
    )
    expect(document.getElementById('invite-member-emails-error')).toHaveTextContent(
      'Enter valid email addresses.',
    )
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('uses a compact email composer with accessible input semantics and a live count', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog open onClose={vi.fn()} />)

    const input = screen.getByLabelText('Email addresses')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'email')
    expect(input).toHaveAttribute('autocomplete', 'email')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).toHaveAttribute('aria-describedby', 'invite-member-emails-hint')
    expect(input.parentElement).toHaveClass('min-h-control', 'p-1.5', 'gap-1.5')

    const count = document.getElementById('invite-member-emails-hint')
    expect(count).toHaveAttribute('aria-live', 'polite')
    expect(count).toHaveAttribute('aria-atomic', 'true')
    expect(count).toHaveTextContent('0 recipients')

    await user.type(input, 'person@example.com{Enter}')
    expect(count).toHaveTextContent('1 recipient')
  })

  it('removes a recipient chip without submitting the form', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog open onClose={vi.fn()} />)

    await user.type(screen.getByLabelText('Email addresses'), 'person@example.com{Enter}')
    await user.click(screen.getByRole('button', { name: 'Remove person@example.com' }))

    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send invitations' })).toBeDisabled()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('keeps the latest draft and input focus when a recipient is removed', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog open onClose={vi.fn()} />)

    const input = screen.getByLabelText('Email addresses')
    await user.type(input, 'person@example.com{Enter}draft@example.com')
    await user.click(screen.getByRole('button', { name: 'Remove person@example.com' }))

    expect(screen.queryByText('person@example.com')).not.toBeInTheDocument()
    expect(input).toHaveValue('draft@example.com')
    expect(input).toHaveFocus()
  })
})
