import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './verify-email-page'

const verifyState = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isIdle: false,
  data: undefined as string | undefined,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a {...props}>{children}</a>
  ),
}))
vi.mock('../stores/auth-store', () => ({ getIsAuthenticated: () => false }))
vi.mock('../hooks/use-verify-email', () => ({ useVerifyEmail: () => verifyState }))

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    verifyState.mutate.mockReset()
    verifyState.isPending = false
    verifyState.isIdle = false
    verifyState.data = undefined
  })

  it('POSTs the token on mount', () => {
    verifyState.isPending = true
    render(<VerifyEmailPage token="tok-123" />)
    expect(verifyState.mutate).toHaveBeenCalledWith('tok-123')
    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument()
  })

  it('shows the success state when verified', () => {
    verifyState.data = 'verified'
    render(<VerifyEmailPage token="tok-123" />)
    expect(screen.getByText(/email verified/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to sign in/i })).toBeInTheDocument()
  })

  it('shows the expired state', () => {
    verifyState.data = 'expired'
    render(<VerifyEmailPage token="tok-123" />)
    expect(screen.getByText(/link expired/i)).toBeInTheDocument()
  })

  it('shows invalid immediately when no token is present', () => {
    render(<VerifyEmailPage token={undefined} />)
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument()
    expect(verifyState.mutate).not.toHaveBeenCalled()
  })
})
