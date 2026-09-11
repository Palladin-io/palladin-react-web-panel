import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { toast, Toaster } from 'sonner'
import i18n from '../../../shared/lib/i18n'
import { notifySharedUnlockCompleted } from './completion-toast'

afterEach(() => { toast.dismiss(); cleanup() })

describe('shared unlock completion presentation', () => {
  it.each([
    ['pl', 'Panel odblokowany przez rozszerzenie Palladin.'],
    ['en', 'Panel unlocked by the Palladin extension.'],
  ])('announces the %s message politely without moving focus', async (language, message) => {
    await i18n.changeLanguage(language)
    const view = render(<><input aria-label="Manual unlock" /><Toaster /></>)
    const input = screen.getByRole('textbox')
    input.focus()
    act(() => notifySharedUnlockCompleted())
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(view.container.querySelector('[aria-live="polite"]')).not.toBeNull()
    expect(input).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
