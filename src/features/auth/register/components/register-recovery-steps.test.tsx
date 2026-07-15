import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RegisterRecoveryConfirmStep } from './register-recovery-steps'

const SAMPLE_WORDS = Array.from({ length: 24 }, (_, index) => `word${index + 1}`)

it('disables navigation back while account creation is in progress', () => {
  render(
    <RegisterRecoveryConfirmStep
      mnemonic={SAMPLE_WORDS}
      isSubmitting
      error={null}
      onBack={vi.fn()}
      onConfirmed={vi.fn()}
    />,
  )

  expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
})
