import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FormSection } from './form-section'

describe('FormSection', () => {
  it('keeps values mounted while animating both ways and makes collapsed controls inert', async () => {
    const user = userEvent.setup()
    render(<FormSection label="Recipient" summary="Anyone"><input aria-label="Email" /></FormSection>)
    const toggle = screen.getByRole('button', { name: 'Recipient: Anyone' })
    const content = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(content).toHaveAttribute('inert')
    expect(content).toHaveAttribute('aria-hidden', 'true')
    expect(content).toHaveStyle({ gridTemplateRows: '0fr', opacity: '0' })
    expect(content).not.toHaveAttribute('hidden')
    expect(content).toHaveClass('motion-reduce:transition-none')
    await user.click(toggle)
    expect(content).not.toHaveAttribute('inert')
    expect(content).toHaveStyle({ gridTemplateRows: '1fr', visibility: 'visible', opacity: '1' })
    await user.type(screen.getByLabelText('Email'), 'test@example.test')
    await user.click(toggle)
    expect(content).toHaveAttribute('inert')
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.test')
    expect(content).toHaveStyle({ gridTemplateRows: '0fr', transitionDelay: '0s, 0s, 200ms' })
    await user.click(toggle)
    expect(screen.getByLabelText('Email')).toHaveValue('test@example.test')
  })

  it('keeps validation feedback visible outside the collapsed content', () => {
    render(<FormSection label="Recipient" summary="Email" error="Invalid email"><input aria-label="Email" /></FormSection>)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email')
    expect(screen.getByRole('alert').closest('[inert]')).toBeNull()
    expect(screen.getByRole('button', { expanded: false })).toHaveAccessibleDescription('Invalid email')
  })
})
