import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './verify-email-page'

const authState = vi.hoisted(() => ({ authenticated: false, emailVerified: false }))
const navigateMock = vi.hoisted(() => vi.fn())
const markVerifiedMock = vi.hoisted(() => vi.fn())
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
const logoutAndReloadMock = vi.hoisted(() => vi.fn())
const clearPushTokenOnLogoutMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}))
vi.mock('../stores/auth-store', () => ({
  getIsAuthenticated: () => authState.authenticated,
  useAuthStore: Object.assign(
    (selector: (s: { emailVerified: boolean }) => unknown) =>
      selector({ emailVerified: authState.emailVerified }),
    { getState: () => ({ markEmailVerified: markVerifiedMock }) },
  ),
}))
vi.mock('../session/client-session', () => ({ logoutAndReload: logoutAndReloadMock }))
vi.mock('../hooks/use-verify-email', () => ({ useVerifyEmail: () => verifyState }))
vi.mock('../hooks/use-resend-verification', () => ({ useResendVerification: () => resendState }))
vi.mock('../../notifications', () => ({
  clearPushTokenOnLogout: clearPushTokenOnLogoutMock,
}))
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
  authState.emailVerified = false
  verifyState.mutate.mockReset()
  verifyState.isPending = false
  verifyState.isIdle = false
  verifyState.data = undefined
  resendState.resend.mockReset()
  resendState.isPending = false
  resendState.isSuccess = false
  resendState.cooldown = 0
  navigateMock.mockReset()
  markVerifiedMock.mockReset()
  logoutAndReloadMock.mockReset()
  clearPushTokenOnLogoutMock.mockReset()
  getAccountMock.mockReset().mockResolvedValue({ email: 'user@example.com', emailVerified: false })
})

describe('VerifyEmailPage — token result flow', () => {
  it('POSTs the token on mount', async () => {
    verifyState.isPending = true
    renderPage(<VerifyEmailPage token="tok-123" />)
    await waitFor(() => {
      expect(verifyState.mutate).toHaveBeenCalledWith('tok-123')
    })
    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument()
  })

  it('shows the success state when verified', () => {
    verifyState.data = 'verified'
    renderPage(<VerifyEmailPage token="tok-123" />)
    expect(screen.getByRole('heading', { name: /email verified/i })).toBeInTheDocument()
    expect(screen.queryByText(/^verified$/i)).not.toBeInTheDocument()
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

  it('auto-forwards after a successful verification', () => {
    vi.useFakeTimers()
    try {
      verifyState.data = 'verified'
      renderPage(<VerifyEmailPage token="tok-123" />)
      expect(navigateMock).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1500))
      expect(navigateMock).toHaveBeenCalledWith({ to: '/login' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats an already-verified session as verified when the token was consumed', () => {
    // Double-fire: the first call verified + consumed the token, the second got
    // "invalid" — but this session is verified, so still show success.
    authState.authenticated = true
    authState.emailVerified = true
    verifyState.data = 'invalid'
    renderPage(<VerifyEmailPage token="tok-123" />)
    expect(screen.getByText(/email verified/i)).toBeInTheDocument()
  })
})

describe('VerifyEmailPage — hard gate (signed in, no token)', () => {
  it('shows the gate with resend and logout', async () => {
    authState.authenticated = true
    renderPage(<VerifyEmailPage token={undefined} />)
    expect(await screen.findByText(/verify your email/i)).toBeInTheDocument()
    expect(screen.getByText(/click it, then come back here/i).closest('p')).toHaveClass('text-meta')
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
    expect(logoutAndReloadMock).toHaveBeenCalledWith(
      '/login',
      clearPushTokenOnLogoutMock,
    )
  })

  it('syncs the store before leaving when the account is already verified (no redirect loop)', async () => {
    // Stale-store scenario: the persisted flag says unverified (that's how the
    // user landed here), but the server reports verified. The gate must clear
    // the store flag so beforeLoad doesn't bounce them straight back.
    authState.authenticated = true
    getAccountMock.mockResolvedValue({ email: 'user@example.com', emailVerified: true })
    renderPage(<VerifyEmailPage token={undefined} />)

    await waitFor(() => expect(markVerifiedMock).toHaveBeenCalledOnce())
    expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
  })
})
