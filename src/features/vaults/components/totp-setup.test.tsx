import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TotpSetupInputs } from './totp-setup'
import { decodeQrImage } from './decode-qr'

vi.mock('./decode-qr', () => ({ decodeQrImage: vi.fn() }))

function pendingDecode() {
  let resolve!: (value: string | null) => void
  vi.mocked(decodeQrImage).mockReturnValueOnce(new Promise((done) => { resolve = done }))
  return async (value: string | null) => { await act(async () => { resolve(value) }) }
}

function uploadQr(container: HTMLElement) {
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(['qr'], 'qr.png', { type: 'image/png' })] },
  })
}

describe('TotpSetupInputs', () => {

  it('ignores a pending QR decode after Cancel', async () => {
    const complete = pendingDecode()
    const onResolved = vi.fn()
    const onClose = vi.fn()
    const { container } = render(<TotpSetupInputs onResolved={onResolved} onClose={onClose} />)
    uploadQr(container)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await complete('JBSWY3DPEHPK3PXP')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('ignores a pending QR decode after unmount', async () => {
    const complete = pendingDecode()
    const onResolved = vi.fn()
    const { container, unmount } = render(<TotpSetupInputs onResolved={onResolved} />)
    uploadQr(container)
    unmount()
    await complete('JBSWY3DPEHPK3PXP')
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('only applies the latest selected QR image', async () => {
    const first = pendingDecode()
    const second = pendingDecode()
    const onResolved = vi.fn()
    const { container } = render(<TotpSetupInputs onResolved={onResolved} />)
    uploadQr(container)
    uploadQr(container)
    await first('JBSWY3DPEHPK3PXP')
    expect(onResolved).not.toHaveBeenCalled()
    await second('GEZDGNBVGY3TQOJQ')
    expect(onResolved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ secret: 'GEZDGNBVGY3TQOJQ' }))
  })

  it('does not overwrite newer text input with a pending QR decode', async () => {
    const complete = pendingDecode()
    const onResolved = vi.fn()
    const { container } = render(<TotpSetupInputs onResolved={onResolved} />)
    uploadQr(container)
    fireEvent.change(screen.getByLabelText(/otpauth/i), { target: { value: 'GEZDGNBVGY3TQOJQ' } })
    await complete('JBSWY3DPEHPK3PXP')
    expect(onResolved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /apply totp/i }))
    expect(onResolved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ secret: 'GEZDGNBVGY3TQOJQ' }))
  })

  it('invalidates QR work when setup becomes disabled', async () => {
    const complete = pendingDecode()
    const onResolved = vi.fn()
    const { container, rerender } = render(<TotpSetupInputs onResolved={onResolved} />)
    uploadQr(container)
    rerender(<TotpSetupInputs onResolved={onResolved} disabled />)
    await complete('JBSWY3DPEHPK3PXP')
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('provides a visible action to apply the secret', async () => {
    const user = userEvent.setup()
    const onResolved = vi.fn()
    render(<TotpSetupInputs onResolved={onResolved} />)
    await user.type(screen.getByLabelText(/otpauth/i), 'JBSWY3DPEHPK3PXP')
    await user.tab()
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
