import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UnlockPage } from './unlock-page'
import { IncorrectMasterPasswordError } from './use-unlock'

const navigateMock = vi.fn()
const mutateMock = vi.fn()
let isPending = false

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
    isPending = false
  })

  it('fires the page-viewed analytics event on mount', async () => {
    const { analytics } = await import('../../shared/lib/analytics')
    render(<UnlockPage />, { wrapper })
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'page-viewed')
  })

  it('renders the heading, subtitle, and forgot-password link', async () => {
    render(<UnlockPage />, { wrapper })
    expect(
      await screen.findByRole('heading', { name: /unlock your vault/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/enter your master password to access your credentials/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /forgot password/i }),
    ).toHaveAttribute('href', '/recovery')
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

    expect(mutateMock).toHaveBeenCalledWith('hunter2', expect.any(Object))
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'vault-unlocked')
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
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
    expect(analytics.capture).toHaveBeenCalledWith('unlock', 'unlock-failed')
    expect(navigateMock).not.toHaveBeenCalledWith({ to: '/' })
  })

  it('falls back to a generic error and fires unlock-failed for unexpected failures', async () => {
    const { analytics } = await import('../../shared/lib/analytics')
    const user = userEvent.setup()
    mutateMock.mockImplementation((_password, options) => {
      options.onError(new Error('network went sideways'))
    })

    render(<UnlockPage />, { wrapper })
    await user.type(await screen.findByLabelText(/master password/i), 'hunter2')
    await user.click(screen.getByRole('button', { name: /^unlock$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /something went wrong/i,
    )
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
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.type(input, 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a disabled unlocking button while the mutation is pending', async () => {
    isPending = true
    render(<UnlockPage />, { wrapper })

    const button = await screen.findByRole('button', { name: /unlocking/i })
    expect(button).toBeDisabled()
  })
})
