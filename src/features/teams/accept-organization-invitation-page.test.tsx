import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AcceptOrganizationInvitationPage } from './accept-organization-invitation-page'

const navigateMock = vi.hoisted(() => vi.fn())
const mutateMock = vi.hoisted(() => vi.fn())
const hasApiErrorKeyMock = vi.hoisted(() => vi.fn())
const logoutMock = vi.hoisted(() => vi.fn())
const acceptState = vi.hoisted(() => ({
  isPending: false,
  isSuccess: false,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }))
vi.mock('../../shared/api/error-response', () => ({
  hasApiErrorKey: hasApiErrorKeyMock,
}))
vi.mock('../notifications', () => ({ clearPushTokenOnLogout: vi.fn() }))
vi.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ logout: logoutMock }) },
}))
vi.mock('./use-accept-organization-invitation', () => ({
  useAcceptOrganizationInvitation: () => ({
    mutate: mutateMock,
    isPending: acceptState.isPending,
    isSuccess: acceptState.isSuccess,
  }),
}))

describe('AcceptOrganizationInvitationPage', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    mutateMock.mockReset()
    hasApiErrorKeyMock.mockReset().mockResolvedValue(false)
    logoutMock.mockReset()
    acceptState.isPending = false
    acceptState.isSuccess = false
  })

  it('renders a deliberate accept action and does not consume the token on mount', () => {
    render(<AcceptOrganizationInvitationPage token="opaque-token" />)

    expect(screen.getByRole('heading', { name: /join the organization/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /accept invitation/i })).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('submits the opaque token only after confirmation', async () => {
    const user = userEvent.setup()
    render(<AcceptOrganizationInvitationPage token="opaque-token" />)

    await user.click(screen.getByRole('button', { name: /accept invitation/i }))

    expect(mutateMock).toHaveBeenCalledWith('opaque-token', expect.any(Object))
  })

  it('directs the accepted session to unlock the joined organization', async () => {
    acceptState.isSuccess = true
    const user = userEvent.setup()
    render(<AcceptOrganizationInvitationPage token="opaque-token" />)

    await user.click(screen.getByRole('button', { name: /unlock organization/i }))

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/unlock',
      search: { redirect: '/' },
    })
  })

  it('explains an email mismatch and offers a safe account switch', async () => {
    hasApiErrorKeyMock.mockImplementation(async (_error, key: string) =>
      key === 'organization-invitation-email-mismatch')
    mutateMock.mockImplementation((_token, options) => {
      void options.onError(new Error('forbidden'))
    })
    const user = userEvent.setup()
    render(<AcceptOrganizationInvitationPage token="opaque-token" />)

    await user.click(screen.getByRole('button', { name: /accept invitation/i }))

    expect(await screen.findByText(/sent to a different email address/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /sign in with another account/i }))
    await waitFor(() => expect(logoutMock).toHaveBeenCalledOnce())
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/login',
      search: { redirect: '/invitations/accept?token=opaque-token' },
    })
  })

  it('rejects a link without a token before any API call', () => {
    render(<AcceptOrganizationInvitationPage />)

    expect(screen.getByText(/invalid, expired, cancelled/i)).toBeInTheDocument()
    expect(mutateMock).not.toHaveBeenCalled()
  })
})
