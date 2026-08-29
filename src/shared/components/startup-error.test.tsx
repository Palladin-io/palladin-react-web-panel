import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../lib/i18n'
import { StartupError } from './startup-error'

describe('StartupError', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('shows the missing variable instead of a blank page in development', () => {
    render(<StartupError missingKeys={['VITE_GOOGLE_CLIENT_ID']} />)

    expect(
      screen.getByRole('heading', { name: 'Application configuration missing' }),
    ).toBeInTheDocument()
    expect(screen.getByText('VITE_GOOGLE_CLIENT_ID')).toBeInTheDocument()
    expect(screen.getByText(/\.env\.local/)).toBeInTheDocument()
  })

  it('offers recovery from an unrelated startup failure', () => {
    render(<StartupError />)

    expect(
      screen.getByRole('heading', { name: 'Palladin could not start' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
