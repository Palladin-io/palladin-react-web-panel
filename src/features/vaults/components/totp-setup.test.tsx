import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TotpSetupInputs } from './totp-setup'

describe('TotpSetupInputs', () => {
  it('provides a visible action to apply the secret', async () => {
    const user = userEvent.setup()
    const onResolved = vi.fn()
    render(<TotpSetupInputs onResolved={onResolved} />)
    await user.type(screen.getByLabelText(/otpauth/i), 'JBSWY3DPEHPK3PXP')
    expect(onResolved).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /apply totp/i }))
    expect(onResolved).toHaveBeenCalledOnce()
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ secret: 'JBSWY3DPEHPK3PXP' }))
  })

  it('confirms with Enter without submitting the parent form', async () => {
    const user = userEvent.setup()
    const onResolved = vi.fn()
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(<form onSubmit={onSubmit}><TotpSetupInputs onResolved={onResolved} /></form>)
    await user.type(screen.getByLabelText(/otpauth/i), 'JBSWY3DPEHPK3PXP{Enter}')
    expect(onResolved).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps invalid input editable and never applies it', () => {
    const onResolved = vi.fn()
    render(<TotpSetupInputs onResolved={onResolved} />)
    fireEvent.change(screen.getByLabelText(/otpauth/i), { target: { value: 'invalid!' } })
    fireEvent.click(screen.getByRole('button', { name: /apply totp/i }))
    expect(onResolved).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeVisible()
  })
})
