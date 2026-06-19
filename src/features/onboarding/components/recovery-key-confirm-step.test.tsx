import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryKeyConfirmStep } from './recovery-key-confirm-step'

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const SAMPLE_WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot',
  'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima',
  'mike', 'nova', 'oscar', 'papa', 'quebec', 'romeo',
  'sierra', 'tango', 'ultra', 'victor', 'whisky', 'xray',
]

function renderStep(overrides: Partial<Parameters<typeof RecoveryKeyConfirmStep>[0]> = {}) {
  return render(
    <RecoveryKeyConfirmStep
      mnemonic={SAMPLE_WORDS}
      onConfirmed={vi.fn()}
      onBack={vi.fn()}
      isSubmitting={false}
      error={null}
      {...overrides}
    />,
  )
}

function askedIndices(): number[] {
  return screen
    .getAllByLabelText(/^word #\d+$/i)
    .map((input) => Number((input as HTMLInputElement).id.replace('recovery-word-', '')))
}

describe('RecoveryKeyConfirmStep', () => {
  it('renders three verification inputs', () => {
    renderStep()
    expect(screen.getAllByLabelText(/^word #\d+$/i)).toHaveLength(3)
  })

  it('disables submit until all three words are correct', async () => {
    const user = userEvent.setup()
    renderStep()

    const submit = screen.getByRole('button', { name: /verify & complete setup/i })
    expect(submit).toBeDisabled()

    const indices = askedIndices()
    const inputs = screen.getAllByLabelText(/^word #\d+$/i)

    await user.type(inputs[0], SAMPLE_WORDS[indices[0]])
    expect(submit).toBeDisabled()

    await user.type(inputs[1], SAMPLE_WORDS[indices[1]])
    expect(submit).toBeDisabled()

    await user.type(inputs[2], SAMPLE_WORDS[indices[2]])
    expect(submit).toBeEnabled()
  })

  it('invokes onConfirmed when the form is submitted with correct words', async () => {
    const onConfirmed = vi.fn()
    const user = userEvent.setup()
    renderStep({ onConfirmed })

    const indices = askedIndices()
    const inputs = screen.getAllByLabelText(/^word #\d+$/i)
    for (let i = 0; i < indices.length; i++) {
      await user.type(inputs[i], SAMPLE_WORDS[indices[i]])
    }

    await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))

    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('shows error feedback for a wrong word', async () => {
    const user = userEvent.setup()
    renderStep()

    expect(screen.queryByRole('alert')).toBeNull()
    await user.type(screen.getAllByLabelText(/^word #\d+$/i)[0], 'notaword')

    expect(screen.getByRole('alert')).toHaveTextContent(/doesn't match/i)
  })

  it('displays the error prop when provided', () => {
    renderStep({ error: 'Setup failed. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Setup failed')
  })

  it('shows a submitting label when isSubmitting is true', () => {
    renderStep({ isSubmitting: true })
    expect(screen.getByRole('button', { name: /finishing setup/i })).toBeDisabled()
  })
})
