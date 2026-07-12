import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TotpChallengeStep } from './totp-challenge-step'

function setup(props: Partial<React.ComponentProps<typeof TotpChallengeStep>> = {}) {
  const onSubmit = vi.fn()
  const onBack = vi.fn()
  render(
    <TotpChallengeStep
      isPending={false}
      errorMessage={null}
      onSubmit={onSubmit}
      onBack={onBack}
      onFieldChange={vi.fn()}
      {...props}
    />,
  )
  return { onSubmit, onBack }
}

describe('TotpChallengeStep', () => {
  it('keeps verify disabled until a full 6-digit code is entered', async () => {
    const user = userEvent.setup()
    setup()
    const verify = screen.getByRole('button', { name: /^verify$/i })
    expect(verify).toBeDisabled()
    await user.type(screen.getByLabelText(/authentication code/i), '123456')
    expect(verify).toBeEnabled()
  })

  it('strips non-digits from the TOTP code', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByLabelText(/authentication code/i)
    await user.type(input, '12ab34cd56')
    expect(input).toHaveValue('123456')
  })

  it('submits the entered code', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup()
    await user.type(screen.getByLabelText(/authentication code/i), '654321')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))
    expect(onSubmit).toHaveBeenCalledWith('654321')
  })

  it('falls back to a recovery code', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup()
    await user.click(screen.getByRole('button', { name: /use a recovery code instead/i }))
    const input = screen.getByLabelText(/recovery code/i)
    await user.type(input, 'ABCD-1234')
    await user.click(screen.getByRole('button', { name: /^verify$/i }))
    expect(onSubmit).toHaveBeenCalledWith('ABCD-1234')
  })

  it('surfaces an error message', () => {
    setup({ errorMessage: 'Invalid code. Please try again.' })
    expect(screen.getByText(/invalid code/i)).toBeInTheDocument()
  })
})
