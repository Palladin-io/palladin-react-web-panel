import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryKeyStep } from './recovery-key-step'

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

const SAMPLE_WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot',
  'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima',
  'mike', 'nova', 'oscar', 'papa', 'quebec', 'romeo',
  'sierra', 'tango', 'ultra', 'victor', 'whisky', 'xray',
]

describe('RecoveryKeyStep', () => {
  it('renders all 24 words numbered', () => {
    render(<RecoveryKeyStep mnemonic={SAMPLE_WORDS} onContinue={vi.fn()} />)
    for (const word of SAMPLE_WORDS) {
      expect(screen.getByText(word)).toBeInTheDocument()
    }
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('uses theme-aware auth surfaces for the mnemonic and its actions', () => {
    render(<RecoveryKeyStep mnemonic={SAMPLE_WORDS} onContinue={vi.fn()} />)

    const firstWord = screen.getByText('alpha')
    const mnemonicList = firstWord.closest('ol')
    expect(mnemonicList).toHaveClass('text-[var(--cv-t1)]')
    expect(mnemonicList?.parentElement).toHaveClass(
      'border-[var(--cv-auth-control-border)]',
      'bg-[var(--cv-auth-control-bg)]',
    )
    expect(firstWord.closest('li')).toHaveClass('bg-[var(--cv-bg-subtle)]')
    expect(screen.getByText('1')).toHaveClass('text-[var(--cv-auth-muted)]')
    expect(screen.getByRole('button', { name: /copy to clipboard/i }))
      .toHaveClass('auth-glass-button')
    expect(screen.getByRole('button', { name: /export as .txt/i }))
      .toHaveClass('auth-glass-button')
  })

  it('copies the mnemonic to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<RecoveryKeyStep mnemonic={SAMPLE_WORDS} onContinue={vi.fn()} />)

    await act(async () => {
      screen.getByRole('button', { name: /copy to clipboard/i }).click()
    })

    expect(writeText).toHaveBeenCalledWith(SAMPLE_WORDS.join(' '))
  })

  it('shows a warning banner', () => {
    render(<RecoveryKeyStep mnemonic={SAMPLE_WORDS} onContinue={vi.fn()} />)
    expect(
      screen.getByText(/cannot recover your vault without this key/i),
    ).toBeInTheDocument()
  })

  it('calls onContinue when the user proceeds', async () => {
    const onContinue = vi.fn()
    const user = userEvent.setup()
    render(<RecoveryKeyStep mnemonic={SAMPLE_WORDS} onContinue={onContinue} />)

    await user.click(
      screen.getByRole('button', { name: /i've saved my recovery key/i }),
    )
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('fires the recovery-key-page-viewed analytics event on mount', async () => {
    const { analytics } = await import('../../../shared/lib/analytics')
    render(<RecoveryKeyStep mnemonic={SAMPLE_WORDS} onContinue={vi.fn()} />)
    expect(analytics.capture).toHaveBeenCalledWith(
      'onboarding',
      'recovery-key-page-viewed',
    )
  })
})
