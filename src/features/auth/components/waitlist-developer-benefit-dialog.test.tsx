import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../shared/lib/i18n'
import { WaitlistDeveloperBenefitDialog } from './waitlist-developer-benefit-dialog'

const benefitState = vi.hoisted(() => ({
  userId: 'user-1',
  waitlistDeveloperBenefitStartedAt: null as string | null,
  waitlistDeveloperBenefitEndsAt: null as string | null,
}))

vi.mock('../stores/auth-store', () => ({
  useAuthStore: (selector: (state: typeof benefitState) => unknown) => selector(benefitState),
}))

describe('WaitlistDeveloperBenefitDialog', () => {
  beforeEach(async () => {
    benefitState.waitlistDeveloperBenefitStartedAt = null
    benefitState.waitlistDeveloperBenefitEndsAt = null
    window.sessionStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('keeps the celebratory dialog open until the user accepts it', async () => {
    benefitState.waitlistDeveloperBenefitStartedAt = '2020-08-25T12:00:00Z'
    benefitState.waitlistDeveloperBenefitEndsAt = '2099-09-25T12:00:00Z'
    window.sessionStorage.setItem(
      'palladin:waitlist-developer-benefit-dialog-dismissed',
      `${benefitState.waitlistDeveloperBenefitStartedAt}|${benefitState.waitlistDeveloperBenefitEndsAt}`,
    )

    const user = userEvent.setup()
    const previouslyFocused = document.createElement('button')
    document.body.appendChild(previouslyFocused)
    previouslyFocused.focus()
    const firstRender = render(<WaitlistDeveloperBenefitDialog />)

    expect(await screen.findByRole('dialog', { name: 'Congratulations!' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Congratulations!' }))
      .toHaveClass('text-page-title')
    const benefitHeading = screen.getByRole('heading', {
      name: 'Your Premium month is active.',
    })
    expect(benefitHeading).toHaveClass('text-heading')
    expect(benefitHeading.querySelector('[data-premium-word]'))
      .toHaveStyle({ color: 'var(--cv-premium)' })
    expect(screen.getByText(/Enjoy your complimentary month of Palladin Premium/)).toBeInTheDocument()
    expect(screen.getByText(/2099/)).toBeInTheDocument()
    expect(screen.queryByText(/2020/)).not.toBeInTheDocument()
    expect(screen.getByText("No card needed. It won't renew automatically.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.getByTestId('benefit-confetti').children.length).toBeGreaterThanOrEqual(24)
    expect(screen.getByTestId('modal-footer')).toHaveClass('bg-[var(--cv-bg-subtle)]')

    const acceptButton = screen.getByRole('button', { name: 'Enjoy Palladin' })
    await waitFor(() => expect(acceptButton).toHaveFocus())
    await user.tab()
    expect(acceptButton).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Congratulations!' })).toBeInTheDocument()

    firstRender.unmount()
    const beforeAcceptance = render(<WaitlistDeveloperBenefitDialog />)
    expect(await screen.findByRole('dialog', { name: 'Congratulations!' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enjoy Palladin' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(previouslyFocused).toHaveFocus()
    const acknowledgement = window.sessionStorage.getItem(
      'palladin:waitlist-developer-benefit-dialog-accepted',
    )
    expect(acknowledgement).toMatch(/^v1\./)
    expect(acknowledgement).not.toContain('2020')
    expect(acknowledgement).not.toContain('2099')

    beforeAcceptance.unmount()
    const secondRender = render(<WaitlistDeveloperBenefitDialog />)
    await act(async () => { await Promise.resolve() })
    expect(secondRender.container).toBeEmptyDOMElement()
    previouslyFocused.remove()
  })

  it('renders nothing without a complete active period', () => {
    const { container } = render(<WaitlistDeveloperBenefitDialog />)
    expect(container).toBeEmptyDOMElement()
  })
})
