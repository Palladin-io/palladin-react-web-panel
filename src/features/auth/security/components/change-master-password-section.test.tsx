import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangeMasterPasswordSection } from './change-master-password-section'

const mutateMock = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
// Hoisted so both the mock factory and the test body share the exact class the
// component's `instanceof` check runs against.
const { IncorrectCurrentPasswordError } = vi.hoisted(() => {
  class IncorrectCurrentPasswordError extends Error {}
  return { IncorrectCurrentPasswordError }
})

vi.mock('../../hooks/use-change-master-password', () => ({
  useChangeMasterPassword: () => ({ mutate: mutateMock, isPending: false }),
  IncorrectCurrentPasswordError,
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/current password/i), 'oldpassword123')
  await user.type(screen.getByLabelText(/^new password$/i), 'newStrongPass123')
  await user.type(screen.getByLabelText(/confirm new password/i), 'newStrongPass123')
}

describe('ChangeMasterPasswordSection', () => {
  beforeEach(() => {
    mutateMock.mockReset()
    toastSuccess.mockReset()
  })

  it('renders the three password fields', () => {
    render(<ChangeMasterPasswordSection />)
    const currentPassword = screen.getByLabelText(/current password/i)
    expect(currentPassword).toBeInTheDocument()
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    expect(currentPassword.closest('form')).toHaveClass('w-full', 'gap-4')
    expect(screen.getByRole('button', { name: /change password/i }).parentElement).toHaveClass(
      'justify-end',
      'border-t',
    )
  })

  it('submits the change and clears the form on success', async () => {
    mutateMock.mockImplementation((_input, opts) => opts.onSuccess())
    const user = userEvent.setup()
    render(<ChangeMasterPasswordSection />)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(mutateMock).toHaveBeenCalledOnce()
    expect(mutateMock.mock.calls[0][0]).toEqual({
      currentPassword: 'oldpassword123',
      newPassword: 'newStrongPass123',
    })
    expect(toastSuccess).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.getByLabelText(/current password/i)).toHaveValue(''),
    )
  })

  it('shows an inline error when the current password is wrong', async () => {
    mutateMock.mockImplementation((_input, opts) =>
      opts.onError(new IncorrectCurrentPasswordError()),
    )
    const user = userEvent.setup()
    render(<ChangeMasterPasswordSection />)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(await screen.findByText(/current password is incorrect/i)).toBeInTheDocument()
  })
})
