import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthRateLimitError } from '../api/auth-api'
import { LoginPage } from './login-page'

// Controllable mock for the password-login handshake.
const startMutate = vi.hoisted(() => vi.fn())
const totpMutate = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())
const clearClientSessionMock = vi.hoisted(() => vi.fn())
const googleLoginMock = vi.hoisted(() => vi.fn())

vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: () => googleLoginMock,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('../hooks/use-login', () => ({
  useLogin: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

vi.mock('../hooks/use-password-login', () => ({
  usePasswordLogin: () => ({
    start: { mutate: startMutate, isPending: false },
    submitTotp: { mutate: totpMutate, isPending: false },
  }),
}))

vi.mock('../session/client-session', () => ({
  clearClientSession: clearClientSessionMock,
}))

vi.mock('../hooks/use-identity-kdf-migration', () => ({
  useIdentityKdfMigration: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    startMutate.mockReset()
    totpMutate.mockReset()
    navigateMock.mockReset()
    clearClientSessionMock.mockReset().mockResolvedValue(undefined)
    googleLoginMock.mockReset()
  })

  it('renders the wordmark and the email/password fields', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: /palladin/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/master password/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/account secret/i)).not.toBeInTheDocument()
  })

  it('keeps Google enabled and Apple/X disabled', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /continue with apple/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /continue with x/i })).toBeDisabled()
  })

  it('renders the rotating welcome line and terms footer', () => {
    render(<LoginPage />)
    expect(screen.getByText(/zero-knowledge by design/i)).toBeInTheDocument()
    expect(screen.getByText(/by continuing, you agree to our/i)).toBeInTheDocument()
  })

  it('submits email + password through the login handshake', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/master password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(clearClientSessionMock).toHaveBeenCalledOnce()
    expect(clearClientSessionMock.mock.invocationCallOrder[0])
      .toBeLessThan(startMutate.mock.invocationCallOrder[0])
    expect(startMutate).toHaveBeenCalledTimes(1)
    expect(startMutate.mock.calls[0][0]).toEqual({
      email: 'user@example.com',
      password: 'hunter2hunter2',
    })
  })

  it('clears the previous client session before opening Google login', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('button', { name: /continue with google/i }))

    expect(clearClientSessionMock).toHaveBeenCalledOnce()
    expect(clearClientSessionMock.mock.invocationCallOrder[0])
      .toBeLessThan(googleLoginMock.mock.invocationCallOrder[0])
  })

  it('advances to the TOTP challenge when the server requires it', async () => {
    // Make the login handshake resolve into a TOTP challenge.
    startMutate.mockImplementation((_input, opts) => {
      opts.onSuccess({ kind: 'totp', challengeToken: 'chal-123' })
    })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/master password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /use a recovery code instead/i }),
    ).toBeInTheDocument()
  })

  it('returns to the requested deep link after password login', async () => {
    startMutate.mockImplementation((_input, options) => {
      options.onSuccess({ kind: 'authenticated' })
    })
    const user = userEvent.setup()

    render(
      <LoginPage redirectTo="/vaults/vault-1/entries/entry-1?tab=logs#history" />,
    )

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/master password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(navigateMock).toHaveBeenCalledWith({
      href: '/vaults/vault-1/entries/entry-1?tab=logs#history',
    })
  })

  it('returns to the requested deep link after the TOTP challenge', async () => {
    startMutate.mockImplementation((_input, options) => {
      options.onSuccess({ kind: 'totp', challengeToken: 'challenge-1' })
    })
    totpMutate.mockImplementation((_input, options) => {
      options.onSuccess()
    })
    const user = userEvent.setup()

    render(<LoginPage redirectTo="/vaults/vault-1/entries/entry-1" />)

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/master password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    await user.type(screen.getByLabelText(/authentication code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    expect(navigateMock).toHaveBeenCalledWith({
      href: '/vaults/vault-1/entries/entry-1',
    })
  })

  it('shows the localized rate-limit error for the password step', async () => {
    startMutate.mockImplementation((_input, options) => {
      options.onError(new AuthRateLimitError(60))
    })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/master password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(screen.getByText('Too many attempts. Try again later.')).toBeInTheDocument()
  })

  it('keeps the TOTP challenge active when verification is rate-limited', async () => {
    startMutate.mockImplementation((_input, options) => {
      options.onSuccess({ kind: 'totp', challengeToken: 'challenge-1' })
    })
    totpMutate.mockImplementation((_input, options) => {
      options.onError(new AuthRateLimitError(60))
    })
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.type(screen.getByLabelText(/master password/i), 'hunter2hunter2')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    await user.type(screen.getByLabelText(/authentication code/i), '123456')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))

    expect(screen.getByText('Too many attempts. Try again later.')).toBeInTheDocument()
    expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument()
  })
})
