import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PremiumGateDialog } from './premium-gate-dialog'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const captureMock = vi.fn()
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: (...args: unknown[]) => captureMock(...args) },
}))

describe('PremiumGateDialog', () => {
  beforeEach(() => {
    captureMock.mockReset()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      <PremiumGateDialog open={false} onClose={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders title and CTAs when open', () => {
    render(<PremiumGateDialog open={true} onClose={vi.fn()} />)
    expect(
      screen.getByRole('dialog', { name: /free plan limit/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /upgrade to pro/i })).toHaveAttribute(
      'href',
      '/billing',
    )
    expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument()
  })

  it('emits the upgrade-prompt-shown analytics event on open', () => {
    render(<PremiumGateDialog open={true} onClose={vi.fn()} />)
    expect(captureMock).toHaveBeenCalledWith('billing', 'upgrade-prompt-shown', {
      reason: 'vault-limit-reached',
    })
  })

  it('invokes onClose when "Maybe later" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<PremiumGateDialog open={true} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /maybe later/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('emits upgrade-prompt-clicked when the upgrade link is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<PremiumGateDialog open={true} onClose={onClose} />)
    await user.click(screen.getByRole('link', { name: /upgrade to pro/i }))
    expect(captureMock).toHaveBeenCalledWith(
      'billing',
      'upgrade-prompt-clicked',
      { reason: 'vault-limit-reached' },
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
