import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MasterPasswordStep } from './master-password-step'

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

describe('MasterPasswordStep', () => {
  it('disables submit until password is strong enough and matches confirmation', async () => {
    const user = userEvent.setup()
    render(<MasterPasswordStep onContinue={vi.fn()} />)

    const submit = screen.getByRole('button', { name: /set master password/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/^master password$/i), 'short')
    expect(submit).toBeDisabled()

    await user.clear(screen.getByLabelText(/^master password$/i))
    await user.type(screen.getByLabelText(/^master password$/i), 'Abcdef1!ghijk')
    expect(submit).toBeDisabled() // confirmation missing

    await user.type(screen.getByLabelText(/confirm password/i), 'Abcdef1!ghijk')
    expect(submit).toBeEnabled()
  })

  it('shows an error when passwords do not match', async () => {
    const user = userEvent.setup()
    render(<MasterPasswordStep onContinue={vi.fn()} />)

    await user.type(screen.getByLabelText(/^master password$/i), 'Abcdef1!ghijk')
    await user.type(screen.getByLabelText(/confirm password/i), 'Different1!')

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
  })

  it('invokes onContinue with the password when submitted', async () => {
    const onContinue = vi.fn()
    const user = userEvent.setup()
    render(<MasterPasswordStep onContinue={onContinue} />)

    await user.type(screen.getByLabelText(/^master password$/i), 'Abcdef1!ghijk')
    await user.type(screen.getByLabelText(/confirm password/i), 'Abcdef1!ghijk')
    await user.click(screen.getByRole('button', { name: /set master password/i }))

    expect(onContinue).toHaveBeenCalledWith('Abcdef1!ghijk')
  })

  it('fires the setup-page-viewed analytics event on mount', async () => {
    const { analytics } = await import('../../../shared/lib/analytics')
    render(<MasterPasswordStep onContinue={vi.fn()} />)
    expect(analytics.capture).toHaveBeenCalledWith('onboarding', 'setup-page-viewed')
  })
})
