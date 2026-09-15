import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './verify-email-page'

const verifyEmailMock = vi.hoisted(() => vi.fn())
const navigateMock = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}))
vi.mock('../api/auth-api', () => ({
  verifyEmail: verifyEmailMock,
}))
vi.mock('../stores/auth-store', () => ({
  getIsAuthenticated: () => false,
  useAuthStore: Object.assign(
    (selector: (state: { emailVerified: boolean }) => unknown) =>
      selector({ emailVerified: false }),
    { getState: vi.fn(), subscribe: vi.fn(() => () => {}) },
  ),
}))

beforeEach(() => {
  verifyEmailMock.mockReset().mockResolvedValue({ status: 'verified' })
  navigateMock.mockReset()
})

it('leaves the loader after verification succeeds in StrictMode', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <VerifyEmailPage token="tok-123" />
      </QueryClientProvider>
    </StrictMode>,
  )

  expect(screen.getByText(/verifying your email/i)).toBeInTheDocument()
  expect(await screen.findByText(/email verified/i)).toBeInTheDocument()
  expect(verifyEmailMock).toHaveBeenCalledOnce()
})
