import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangeShareProtectionDialog } from './change-share-protection-dialog'
import { sharingId, sharingScope } from './sharing-test-fixtures'

const mocks = vi.hoisted(() => ({ change: vi.fn(), success: vi.fn(), error: vi.fn(), current: vi.fn(), close: vi.fn(), changed: vi.fn() }))
vi.mock('./sharing-api', () => ({ changeEntryShareProtection: mocks.change }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
beforeEach(() => { vi.resetAllMocks(); mocks.current.mockReturnValue(true); mocks.change.mockResolvedValue(undefined) })
afterEach(cleanup)
function mount() {
  return render(<ChangeShareProtectionDialog scope={sharingScope} shareId={sharingId} protection="password"
    isCurrent={mocks.current} onClose={mocks.close} onChanged={mocks.changed} />)
}
describe('change sharing protection', () => {
  it('renders shared controls, masks the new secret and validates on blur', () => {
    mount()
    expect(screen.getByRole('dialog', { name: 'Change protection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic password' } })
    expect(screen.getByLabelText('Password')).toHaveClass('secret-mask')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pin' } })
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '12' } })
    fireEvent.blur(screen.getByLabelText('PIN'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('removes protection with an explicit null secret and closes only after success', async () => {
    mount()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'none')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith(sharingScope.vaultId, sharingScope.entryId, sharingId, 'none', null, expect.any(AbortSignal)))
    expect(mocks.changed).toHaveBeenCalledOnce()
    expect(mocks.success).toHaveBeenCalledWith('Link protection updated')
  })
  it('keeps the form retryable and reports a generic failure through Sonner', async () => {
    mocks.change.mockRejectedValue(new Error('synthetic transport error'))
    mount()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'none')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Link protection could not be updated. Try again.'))
    expect(mocks.changed).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
  it('preserves password whitespace rather than silently changing the secret', async () => {
    mount()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: '  synthetic password  ' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Confirm password or PIN'), { target: { value: '  synthetic password  ' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mocks.change).toHaveBeenCalledWith(sharingScope.vaultId, sharingScope.entryId, sharingId, 'password', '  synthetic password  ', expect.any(AbortSignal)))
  })
  it('aborts on unmount and suppresses late success for a replaced owner', async () => {
    let resolve!: () => void
    mocks.change.mockReturnValue(new Promise<void>((done) => { resolve = done }))
    const view = mount()
    await userEvent.selectOptions(screen.getByRole('combobox'), 'none')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const signal = mocks.change.mock.calls[0][5] as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve() })
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.changed).not.toHaveBeenCalled()
  })
  it('does not submit after authority is lost', async () => {
    mount()
    mocks.current.mockReturnValue(false)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'none')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.change).not.toHaveBeenCalled()
  })
  it('clears and retires the form on pagehide, including a BFCache return', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic password' } })
    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.submit(document.getElementById('share-protection-form')!)
    expect(mocks.change).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })
})
