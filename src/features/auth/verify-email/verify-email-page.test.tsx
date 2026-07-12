import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './verify-email-page'

const authState = vi.hoisted(() => ({ authenticated: false }))
const verifyState = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isIdle: false,
  data: undefined as string | undefined,
}))
const resendState = vi.hoisted(() => ({
  resend: vi.fn(),
  isPending: false,
  isSuccess: false,
  cooldown: 0,
}))
const getAccountMock = vi.hoisted(() => vi.fn())
const logoutMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}))
vi.mock('../stores/auth-store', () => ({
  getIsAuthenticated: () => authState.authenticated,
  useAuthStore: { getState: () => ({ logout: logoutMock }) },
}))
vi.mock('../hooks/use-verify-email', () => ({ useVerifyEmail: () => verifyState }))
vi.mock('../hooks/use-resend-verification', () => ({ useResendVerification: () => resendState }))
vi.mock('../../notifications', () => ({ clearPushTokenOnLogout: vi.fn() }))
vi.mock('../../../shared/api/account-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/api/account-api')>()
  return { ...actual, getAccount: getAccountMock }
})

function renderPage(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(createElement(QueryClientProvider, { client }, ui))
}

beforeEach(() => {
  authState.authenticated = false
  verifyState.mutate.mockReset()
  verifyState.isPending = false
  verifyState.isIdle = false
  verifyState.data = undefined
  resendState.resend.mockReset()
  resendState.isPending = false
  resendState.isSuccess = false
  resendState.cooldown = 0
  getAccountMock.mockReset().mockResolvedValue({ email: 'user@example.com', emailVerified: false })
})

describe('VerifyEmailPage — token result flow', () => {
  it('POSTs the token on mount', () => {
    verifyState.isPending = true
    renderPage(<VerifyEmailPage token="tok-123" />)
    expect(verifyState.mutate).toHaveBeenCalledWith('tok-123')
    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument()
  })

  it('shows the success state when verified', () => {
    verifyState.data = 'verified'
    renderPage(<VerifyEmailPage token="tok-123" />)
    expect(screen.getByText(/email verified/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument()
  })

  it('shows the expired state', () => {
    verifyState.data = 'expired'
    renderPage(<VerifyEmailPage token="tok-123" />)
    expect(screen.getByText(/link expired/i)).toBeInTheDocument()
  })

  it('shows invalid when no token and no session', () => {
    renderPage(<VerifyEmailPage token={undefined} />)
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument()
    expect(verifyState.mutate).not.toHaveBeenCalled()
  })
})

describe('VerifyEmailPage — hard gate (signed in, no token)', () => {
  it('shows the gate with resend and logout', async () => {
    authState.authenticated = true
    renderPage(<VerifyEmailPage token={undefined} />)
    expect(await screen.findByText(/verify your email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resend email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
    // The gate never POSTs a (missing) token.
    expect(verifyState.mutate).not.toHaveBeenCalled()
  })

  it('triggers resend when the button is clicked', async () => {
    authState.authenticated = true
    const user = userEvent.setup()
    renderPage(<VerifyEmailPage token={undefined} />)
    await user.click(await screen.findByRole('button', { name: /resend email/i }))
    expect(resendState.resend).toHaveBeenCalledOnce()
  })

  it('logs out when the logout button is clicked', async () => {
    authState.authenticated = true
    const user = userEvent.setup()
    renderPage(<VerifyEmailPage token={undefined} />)
    await user.click(await screen.findByRole('button', { name: /log out/i }))
    expect(logoutMock).toHaveBeenCalledOnce()
  })
})
