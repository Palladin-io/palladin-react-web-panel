import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IncorrectCurrentPasswordError } from '../../hooks/use-change-master-password'
import { TotpDisableDialog } from './totp-disable-dialog'

const disableMutate = vi.hoisted(() => vi.fn())

vi.mock('../../hooks/use-totp', () => ({
  useTotpEnrollment: () => ({
    enroll: { mutate: vi.fn(), isPending: false },
    confirm: { mutate: vi.fn(), isPending: false },
    disable: { mutate: disableMutate, isPending: false },
  }),
}))

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/current password/i), 'login-password')
  await user.type(screen.getByLabelText(/authentication code/i), '123456')
  await user.click(screen.getByRole('button', { name: /^disable 2fa$/i }))
}

describe('TotpDisableDialog', () => {
  beforeEach(() => {
    disableMutate.mockReset()
  })

  it('disables with the code and the current password', async () => {
    const onClose = vi.fn()
    disableMutate.mockImplementation((_input, opts) => opts.onSuccess())
    const user = userEvent.setup()
    render(<TotpDisableDialog open onClose={onClose} />)
    const password = screen.getByLabelText(/current password/i)
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveClass('ph-no-capture')

    await submit(user)

    expect(disableMutate).toHaveBeenCalledWith(
      { code: '123456', currentPassword: 'login-password' },
      expect.anything(),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a password error when the current password is rejected', async () => {
    disableMutate.mockImplementation((_input, opts) => opts.onError(new IncorrectCurrentPasswordError()))
    const user = userEvent.setup()
    render(<TotpDisableDialog open onClose={vi.fn()} />)

    await submit(user)

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument()
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument()
  })
})
