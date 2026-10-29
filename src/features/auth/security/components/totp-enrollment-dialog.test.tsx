import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IncorrectCurrentPasswordError } from '../../hooks/use-change-master-password'
import { TotpEnrollmentDialog } from './totp-enrollment-dialog'

const enrollMutate = vi.hoisted(() => vi.fn())
const confirmMutate = vi.hoisted(() => vi.fn())
const enrollState = vi.hoisted(() => ({
  mutate: enrollMutate,
  isPending: false,
  isError: false,
  data: { secret: 'ABCDEF123456', otpauthUri: 'otpauth://totp/Palladin' } as
    | { secret: string; otpauthUri: string }
    | undefined,
}))

vi.mock('../../hooks/use-totp', () => ({
  useTotpEnrollment: () => ({
    enroll: enrollState,
    confirm: { mutate: confirmMutate, isPending: false },
    disable: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('../../../../shared/components/qr-code', () => ({
  QrCode: () => <div data-testid="qr" />,
}))

async function passPasswordStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/current password/i), 'login-password')
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

describe('TotpEnrollmentDialog', () => {
  beforeEach(() => {
    enrollMutate.mockReset()
    confirmMutate.mockReset()
    enrollMutate.mockImplementation((_password, opts) => opts.onSuccess())
  })

  it('asks for the current password before starting enrollment', async () => {
    const user = userEvent.setup()
    render(<TotpEnrollmentDialog open onClose={vi.fn()} />)
    expect(enrollMutate).not.toHaveBeenCalled()
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument()

    await passPasswordStep(user)

    expect(enrollMutate).toHaveBeenCalledWith('login-password', expect.anything())
    expect(screen.getByTestId('qr')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ABCDEF123456')).toBeInTheDocument()
  })

  it('shows an inline error when the current password is rejected', async () => {
    enrollMutate.mockImplementation((_password, opts) => opts.onError(new IncorrectCurrentPasswordError()))
    const user = userEvent.setup()
    render(<TotpEnrollmentDialog open onClose={vi.fn()} />)

    await passPasswordStep(user)

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument()
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument()
  })

  it('confirms the code with the current password and reveals the recovery codes once', async () => {
    confirmMutate.mockImplementation((_input, opts) =>
      opts.onSuccess({ recoveryCodes: ['aaaa-1111', 'bbbb-2222'] }),
    )
    const user = userEvent.setup()
    render(<TotpEnrollmentDialog open onClose={vi.fn()} />)
    await passPasswordStep(user)

    await user.type(screen.getByLabelText(/authentication code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^enable$/i }))

    expect(confirmMutate).toHaveBeenCalledWith(
      { code: '123456', currentPassword: 'login-password' },
      expect.anything(),
    )
    expect(screen.getByText('aaaa-1111')).toBeInTheDocument()
    expect(screen.getByText('bbbb-2222')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
  })

  it('shows an error when the confirmation code is rejected', async () => {
    confirmMutate.mockImplementation((_input, opts) => opts.onError(new Error('bad')))
    const user = userEvent.setup()
    render(<TotpEnrollmentDialog open onClose={vi.fn()} />)
    await passPasswordStep(user)

    await user.type(screen.getByLabelText(/authentication code/i), '000000')
    await user.click(screen.getByRole('button', { name: /^enable$/i }))

    expect(await screen.findByText(/invalid code/i)).toBeInTheDocument()
  })
})
