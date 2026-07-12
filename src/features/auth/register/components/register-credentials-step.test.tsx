import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterCredentialsStep } from './register-credentials-step'

const pwnedCheck = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}))
vi.mock('../../../../shared/lib/hibp', () => ({ checkPasswordPwned: pwnedCheck }))

describe('RegisterCredentialsStep', () => {
  beforeEach(() => {
    pwnedCheck.mockReset().mockResolvedValue({ pwned: false, count: 0 })
  })

  it('keeps Continue disabled until email, strong password and match are valid', async () => {
    const user = userEvent.setup()
    render(<RegisterCredentialsStep onContinue={vi.fn()} />)
    const cont = screen.getByRole('button', { name: /continue/i })
    expect(cont).toBeDisabled()

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/^master password$/i), 'StrongPass123')
    await user.type(screen.getByLabelText(/confirm master password/i), 'StrongPass123')
    expect(cont).toBeEnabled()
  })

  it('passes the trimmed email and password to onContinue', async () => {
    const onContinue = vi.fn()
    const user = userEvent.setup()
    render(<RegisterCredentialsStep onContinue={onContinue} />)

    await user.type(screen.getByLabelText(/email/i), '  user@example.com  ')
    await user.type(screen.getByLabelText(/^master password$/i), 'StrongPass123')
    await user.type(screen.getByLabelText(/confirm master password/i), 'StrongPass123')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(onContinue).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'StrongPass123',
    })
  })

  it('warns when the password appears in a breach (advisory, not blocking)', async () => {
    pwnedCheck.mockResolvedValue({ pwned: true, count: 9 })
    const user = userEvent.setup()
    render(<RegisterCredentialsStep onContinue={vi.fn()} />)

    await user.type(screen.getByLabelText(/^master password$/i), 'StrongPass123')
    expect(
      await screen.findByText(/password found in a data breach/i),
    ).toBeInTheDocument()
  })
})
