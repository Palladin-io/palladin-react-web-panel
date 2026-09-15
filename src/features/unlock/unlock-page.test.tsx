import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { UnlockPage } from './unlock-page'
import { IncorrectMasterPasswordError } from './use-unlock'
import { getAccount } from '../../shared/api/account-api'

const navigateMock = vi.fn()
const mutateMock = vi.fn()
let isPending = false

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

vi.mock('./use-unlock', async () => {
  const actual = await vi.importActual<typeof import('./use-unlock')>(
    './use-unlock',
  )
  return {
    ...actual,
    useUnlock: () => ({
      mutate: mutateMock,
      get isPending() {
        return isPending
      },
    }),
  }
})

// Default: account is set up so the unlock form renders (not the wizard).
vi.mock('../../shared/api/account-api', () => ({
  ACCOUNT_QUERY_KEY: ['account'],
  getAccount: vi.fn().mockResolvedValue({ isOnboarded: true, salt: 'mock-salt', encryptedPrivateKey: 'mock-key' }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('UnlockPage', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    mutateMock.mockReset()
    vi.mocked(toast.error).mockReset()
    isPending = false
    vi.mocked(getAccount).mockReset()
    vi.mocked(getAccount).mockResolvedValue({
      userId: 'user-id',
      email: 'user@example.com',
      displayName: 'User',
      avatarUrl: null,
      isOnboarded: true,
      salt: 'mock-salt',
      encryptedPrivateKey: 'mock-key',
    })
  })

  it('fails closed when account key material cannot be loaded', async () => {
    vi.mocked(getAccount).mockRejectedValue(new Error('network unavailable'))

    render(<UnlockPage />, { wrapper })

    expect(
      await screen.findByRole('heading', { name: /unable to load account/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: /set master password/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled()
  })

  it('fires the page-viewed analytics event on mount', async () => {
    const { analytics } = await import('../../shared/lib/analytics')
    render(<UnlockPage />, { wrapper })
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'page-viewed')
  })

  it('renders the heading, subtitle, and forgot-password link', async () => {
    const { container } = render(<UnlockPage />, { wrapper })
    expect(
      await screen.findByRole('heading', { name: /unlock your vault/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/enter your master password to access your credentials/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /forgot password/i }),
    ).toHaveAttribute('href', '/recovery')
    expect(screen.getByRole('heading', { name: 'Palladin.io' })).toBeInTheDocument()
    expect(screen.getByText('Zero-knowledge by design.')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('auth-surface')
    expect(container.firstElementChild).not.toHaveClass('dark')
    expect(container.querySelector('.auth-logo-glow')).toBeInTheDocument()
  })

  it('disables the submit button while the password field is empty', async () => {
    render(<UnlockPage />, { wrapper })
    expect(await screen.findByRole('button', { name: /^unlock$/i })).toBeDisabled()
  })

  it('enables submit once the user starts typing', async () => {
    const user = userEvent.setup()
    render(<UnlockPage />, { wrapper })

    await user.type(await screen.findByLabelText(/master password/i), 'hunter2')
    expect(screen.getByRole('button', { name: /^unlock$/i })).toBeEnabled()
  })

  it('calls the unlock mutation, fires vault-unlocked and navigates on success', async () => {
    const { analytics } = await import('../../shared/lib/analytics')
    const user = userEvent.setup()
    mutateMock.mockImplementation((_password, options) => {
      options.onSuccess()
    })

    render(<UnlockPage />, { wrapper })
    await user.type(await screen.findByLabelText(/master password/i), 'hunter2')
    await user.click(screen.getByRole('button', { name: /^unlock$/i }))

    expect(mutateMock).toHaveBeenCalledWith(
      { password: 'hunter2' },
      expect.any(Object),
    )
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'vault-unlocked')
    expect(navigateMock).toHaveBeenCalledWith({ href: '/' })
  })

  it('returns to the requested deep link after unlocking', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_password, options) => {
      options.onSuccess()
    })

    render(
      <UnlockPage redirectTo="/vaults/vault-1/entries/entry-1?tab=logs#history" />,
      { wrapper },
    )
    await user.type(await screen.findByLabelText(/master password/i), 'hunter2')
    await user.click(screen.getByRole('button', { name: /^unlock$/i }))

    expect(navigateMock).toHaveBeenCalledWith({
      href: '/vaults/vault-1/entries/entry-1?tab=logs#history',
    })
  })

  it('shows the typed error message and fires unlock-failed when the password is incorrect', async () => {
    const { analytics } = await import('../../shared/lib/analytics')
    const user = userEvent.setup()
    mutateMock.mockImplementation((_password, options) => {
      options.onError(new IncorrectMasterPasswordError())
    })

    render(<UnlockPage />, { wrapper })
    await user.type(await screen.findByLabelText(/master password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /^unlock$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /incorrect master password/i,
    )
    expect(screen.getByLabelText(/master password/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/master password/i)).toHaveAccessibleDescription(/incorrect master password/i)
    expect(toast.error).not.toHaveBeenCalled()
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'unlock-failed')
    expect(navigateMock).not.toHaveBeenCalledWith({ href: '/' })
  })

  it('shows a generic toast without marking the password invalid for unexpected failures', async () => {
    const { analytics } = await import('../../shared/lib/analytics')
    const user = userEvent.setup()
    mutateMock.mockImplementation((_password, options) => {
      options.onError(new Error('network went sideways'))
    })

    render(<UnlockPage />, { wrapper })
    await user.type(await screen.findByLabelText(/master password/i), 'hunter2')
    await user.click(screen.getByRole('button', { name: /^unlock$/i }))

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/something went wrong/i))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/master password/i)).toHaveAttribute('aria-invalid', 'false')
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'unlock-failed')
  })

  it('clears the error as the user starts correcting their input', async () => {
    const user = userEvent.setup()
    mutateMock.mockImplementation((_password, options) => {
      options.onError(new IncorrectMasterPasswordError())
    })

    render(<UnlockPage />, { wrapper })
    const input = await screen.findByLabelText(/master password/i)
    await user.type(input, 'wrong')
    await user.click(screen.getByRole('button', { name: /^unlock$/i }))
    const feedback = await screen.findByRole('alert')

    await user.type(input, 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).not.toHaveAttribute('aria-describedby')
    expect(feedback).toHaveAttribute('aria-hidden', 'true')
    expect(feedback).toHaveTextContent(/incorrect master password/i)
  })

  it('renders a disabled unlocking button while the mutation is pending', async () => {
    isPending = true
    render(<UnlockPage />, { wrapper })

    const button = await screen.findByRole('button', { name: /unlocking/i })
    expect(button).toBeDisabled()
  })
})
