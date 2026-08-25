import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../../shared/lib/i18n'
import { useAuthStore } from '../stores/auth-store'
import { WaitlistDeveloperBenefitBanner } from './waitlist-developer-benefit-banner'

describe('WaitlistDeveloperBenefitBanner', () => {
  beforeEach(async () => {
    useAuthStore.getState().logout()
    await i18n.changeLanguage('en')
  })

  it('shows the exact active window and non-renewal terms', () => {
    useAuthStore.getState().setTokens({
      accessToken: 'access',
      refreshToken: 'refresh',
      userId: 'user',
      isOnboarded: true,
      waitlistDeveloperBenefitStartedAt: '2020-08-25T12:00:00Z',
      waitlistDeveloperBenefitEndsAt: '2099-09-25T12:00:00Z',
    })

    render(<WaitlistDeveloperBenefitBanner />)

    expect(screen.getByText('Your Developer month is active')).toBeInTheDocument()
    expect(screen.getByText(/2020/)).toBeInTheDocument()
    expect(screen.getByText(/2099/)).toBeInTheDocument()
    expect(screen.getByText(/No card, automatic renewal or charge/)).toBeInTheDocument()
    expect(screen.getByText(/returns to Free/)).toBeInTheDocument()
  })

  it('renders nothing without a complete active period', () => {
    const { container } = render(<WaitlistDeveloperBenefitBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
