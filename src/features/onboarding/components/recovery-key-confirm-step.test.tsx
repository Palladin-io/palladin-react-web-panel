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

function askedIndices(): number[] {
  return screen
    .getAllByLabelText(/^word #\d+$/i)
    .map((input) => Number((input as HTMLInputElement).id.replace('recovery-word-', '')))
}

describe('RecoveryKeyConfirmStep', () => {
  it('renders three verification inputs', () => {
    render(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={vi.fn()}
        isSubmitting={false}
        error={null}
      />,
    )

    expect(screen.getAllByLabelText(/^word #\d+$/i)).toHaveLength(3)
  })

  it('disables submit until all three words are correct', async () => {
    const user = userEvent.setup()
    render(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={vi.fn()}
        isSubmitting={false}
        error={null}
      />,
    )

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
    render(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={onConfirmed}
        isSubmitting={false}
        error={null}
      />,
    )

    const indices = askedIndices()
    const inputs = screen.getAllByLabelText(/^word #\d+$/i)

    for (let i = 0; i < indices.length; i++) {
      await user.type(inputs[i], SAMPLE_WORDS[indices[i]])
    }

    await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))

    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('shows "Correct" feedback for matched words and error feedback for wrong ones', async () => {
    const user = userEvent.setup()
    render(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={vi.fn()}
        isSubmitting={false}
        error={null}
      />,
    )

    const indices = askedIndices()
    const inputs = screen.getAllByLabelText(/^word #\d+$/i)

    await user.type(inputs[0], SAMPLE_WORDS[indices[0]])
    expect(screen.getAllByText(/correct/i).length).toBeGreaterThan(0)

    await user.type(inputs[1], 'notaword')
    expect(screen.getByText(/doesn't match/i)).toBeInTheDocument()
  })

  it('displays the error prop when provided', () => {
    render(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={vi.fn()}
        isSubmitting={false}
        error="Setup failed. Please try again."
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Setup failed')
  })

  it('shows a submitting label when isSubmitting is true', () => {
    render(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={vi.fn()}
        isSubmitting
        error={null}
      />,
    )
    expect(screen.getByRole('button', { name: /finishing setup/i })).toBeDisabled()
  })
})
