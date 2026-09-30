import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../shared/lib/i18n'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import { SaveShareCopyDialog } from './save-share-copy-dialog'

const mocks = vi.hoisted(() => ({ save: vi.fn(), prepareVault: vi.fn(), retryLoad: vi.fn(), success: vi.fn(), error: vi.fn(),
  state: { loading: false, loadError: false, busy: false, retryPending: false, saved: false,
    vaults: [{ id: 'target', name: 'Personal' }] as { id: string; name: string | null }[] } }))
vi.mock('./use-save-share-copy', () => ({ useSaveShareCopy: () => ({ ...mocks.state,
  save: mocks.save, retryLoad: mocks.retryLoad, prepareVault: mocks.prepareVault }) }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
beforeEach(async () => {
  vi.resetAllMocks()
  Object.assign(mocks.state, { loading: false, loadError: false, busy: false, retryPending: false, saved: false,
    vaults: [{ id: 'target', name: 'Personal' }] })
  mocks.save.mockResolvedValue('saved')
  mocks.prepareVault.mockResolvedValue('ready')
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('Save received copy dialog', () => {
  it('offers explicit inline Vault creation without selecting or saving the Entry automatically', async () => {
    mocks.state.vaults = []
    const onSaved = vi.fn()
    const props = { snapshot: fixture.snapshot as EntryShareSnapshot, onSaved, onClose: vi.fn() }
    const { rerender } = render(<SaveShareCopyDialog {...props} />)
    expect(mocks.prepareVault).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Keep this tab open')
    await userEvent.click(screen.getByRole('button', { name: 'Create my personal vault' }))
    expect(mocks.prepareVault).toHaveBeenCalledOnce()
    expect(mocks.success).toHaveBeenCalledWith('Your vault is ready. Select it to save the copy.')
    expect(onSaved).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    mocks.state.vaults = [{ id: 'target', name: 'Personal' }]
    rerender(<SaveShareCopyDialog {...props} />)
    expect(screen.queryByRole('button', { name: 'Create my personal vault' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to my vault' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Destination vault'), 'target')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it.each(['failed', 'cancelled'])('keeps the dialog and copy on %s Vault preparation', async (outcome) => {
    mocks.state.vaults = []
    mocks.prepareVault.mockResolvedValue(outcome)
    const onSaved = vi.fn()
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={onSaved} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create my personal vault' }))
    expect(mocks.error).toHaveBeenCalledTimes(outcome === 'failed' ? 1 : 0)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not offer creation on a failed Vault list and labels its non-destructive request retry', async () => {
    mocks.state.vaults = []; mocks.state.loadError = true
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Create my personal vault' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.retryLoad).toHaveBeenCalledOnce()
    expect(mocks.prepareVault).not.toHaveBeenCalled()
  })

  it('disables creation, editing and closing while preparing the Vault', () => {
    mocks.state.vaults = []; mocks.state.busy = true
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Create my personal vault' })).toBeDisabled()
    expect(screen.getByLabelText('Copy title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('requires an explicit Vault choice and saves only on submit', async () => {
    const onSaved = vi.fn()
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={onSaved} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('The copy will appear in Agent Discovery')
    expect(screen.getByRole('button', { name: 'Save to my vault' })).toBeDisabled()
    expect(mocks.save).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByLabelText('Destination vault'), 'target')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
    expect(mocks.success).toHaveBeenCalledWith('Copy saved to your vault')
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('retains the received copy after a failed save without showing raw errors', async () => {
    mocks.save.mockResolvedValue('failed')
    const onSaved = vi.fn()
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={onSaved} onClose={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText('Destination vault'), 'target')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledOnce())
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('locks choices and exposes the exact retry after an ambiguous response', async () => {
    mocks.state.retryPending = true
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Destination vault')).toBeDisabled()
    expect(screen.getByLabelText('Copy title')).toBeDisabled()
    expect(screen.getByRole('dialog')).toHaveTextContent('check your vault before starting a new save')
    await userEvent.click(screen.getByRole('button', { name: 'Retry the same save' }))
    expect(mocks.save).toHaveBeenCalledOnce()
  })

  it('requires only omitted card fields and never asks to replace the received number', async () => {
    const snapshot: EntryShareSnapshot = { schema: 'palladin.entry-share.v1', title: 'Card copy', entryType: 'creditCard', fields: [
      { id: 'creditCard.cardNumber', label: '', type: 'concealed', value: '4111111111111111' }] }
    render(<SaveShareCopyDialog snapshot={snapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Card number')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Destination vault'), 'target')
    expect(screen.getByRole('button', { name: 'Save to my vault' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Cardholder'), 'Example User')
    await userEvent.type(screen.getByLabelText('Expiry month'), '12')
    await userEvent.type(screen.getByLabelText('Expiry year'), '2030')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.save).toHaveBeenCalledWith('target', { title: 'Card copy', additions: {
      'creditCard.cardholderName': 'Example User', 'creditCard.expiryMonth': '12', 'creditCard.expiryYear': '2030' } })
  })
})
