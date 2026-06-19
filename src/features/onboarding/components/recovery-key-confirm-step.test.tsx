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

/** Type each required word correctly, one at a time; later inputs reveal as earlier ones pass. */
async function fillAllCorrect(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  let visible = screen.getAllByLabelText(/^word #\d+$/i).length
  while (true) {
    const inputs = screen.getAllByLabelText(/^word #\d+$/i) as HTMLInputElement[]
    const next = inputs[inputs.length - 1]
    const idx = Number(next.id.replace('recovery-word-', ''))
    await user.type(next, SAMPLE_WORDS[idx])
    const nowVisible = screen.getAllByLabelText(/^word #\d+$/i).length
    if (nowVisible === visible) break // last word — nothing more reveals
    visible = nowVisible
  }
}

describe('RecoveryKeyConfirmStep', () => {
  it('reveals only the first input initially', () => {
    renderStep()
    expect(screen.getAllByLabelText(/^word #\d+$/i)).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /verify & complete setup/i })).toBeNull()
  })

  it('reveals the next input only after the current word is correct', async () => {
    const user = userEvent.setup()
    renderStep()

    const first = screen.getByLabelText(/^word #\d+$/i) as HTMLInputElement
    const idx0 = Number(first.id.replace('recovery-word-', ''))
    await user.type(first, SAMPLE_WORDS[idx0])

    expect(screen.getAllByLabelText(/^word #\d+$/i)).toHaveLength(2)
  })

  it('shows error feedback for a wrong word and does not reveal the next input', async () => {
    const user = userEvent.setup()
    renderStep()

    await user.type(screen.getByLabelText(/^word #\d+$/i), 'notaword')

    expect(screen.getAllByText(/doesn't match/i).length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText(/^word #\d+$/i)).toHaveLength(1)
  })

  it('shows the submit button only once every word is correct', async () => {
    const user = userEvent.setup()
    renderStep()

    expect(screen.queryByRole('button', { name: /verify & complete setup/i })).toBeNull()
    await fillAllCorrect(user)
    expect(screen.getByRole('button', { name: /verify & complete setup/i })).toBeEnabled()
  })

  it('invokes onConfirmed when submitted with all correct words', async () => {
    const onConfirmed = vi.fn()
    const user = userEvent.setup()
    renderStep({ onConfirmed })

    await fillAllCorrect(user)
    await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))

    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('displays the error prop when provided', () => {
    renderStep({ error: 'Setup failed. Please try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Setup failed')
  })

  it('shows a submitting label while finishing', async () => {
    const user = userEvent.setup()
    const { rerender } = renderStep()

    await fillAllCorrect(user)

    rerender(
      <RecoveryKeyConfirmStep
        mnemonic={SAMPLE_WORDS}
        onConfirmed={vi.fn()}
        onBack={vi.fn()}
        isSubmitting
        error={null}
      />,
    )

    expect(screen.getByRole('button', { name: /finishing setup/i })).toBeDisabled()
  })
})
