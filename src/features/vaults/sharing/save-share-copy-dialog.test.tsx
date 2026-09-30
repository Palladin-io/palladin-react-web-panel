import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../shared/lib/i18n'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import { SaveShareCopyDialog } from './save-share-copy-dialog'

const mocks = vi.hoisted(() => ({ save: vi.fn(), createNamedVault: vi.fn(), retryLoad: vi.fn(), success: vi.fn(), error: vi.fn(),
  state: { loading: false, loadError: false, busy: false, retryPending: false, pendingVaultName: null as string | null, saved: false,
    vaults: [{ id: 'target', name: 'Personal' }] as { id: string; name: string | null }[] } }))
vi.mock('./use-save-share-copy', () => ({ useSaveShareCopy: () => ({ ...mocks.state,
  save: mocks.save, retryLoad: mocks.retryLoad, createNamedVault: mocks.createNamedVault }) }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
beforeEach(async () => {
  vi.resetAllMocks()
  Object.assign(mocks.state, { loading: false, loadError: false, busy: false, retryPending: false, pendingVaultName: null, saved: false,
    vaults: [{ id: 'target', name: 'Personal' }] })
  mocks.save.mockResolvedValue({ vaultId: 'target', entryId: 'saved-entry' })
  mocks.createNamedVault.mockResolvedValue({ vaultId: 'new-vault' })
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('Save received copy dialog', () => {
  it('creates a typed new Vault before saving the copy and returns the exact new Entry', async () => {
    mocks.state.vaults = []
    mocks.save.mockResolvedValue({ vaultId: 'new-vault', entryId: 'saved-entry' })
    const onSaved = vi.fn()
    const props = { snapshot: fixture.snapshot as EntryShareSnapshot, onSaved, onClose: vi.fn() }
    render(<SaveShareCopyDialog {...props} />)
    expect(mocks.createNamedVault).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Keep this tab open')
    await userEvent.type(screen.getByLabelText('New vault name'), 'New vault')
    expect(screen.getByText('A new vault named New vault will be created before saving.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    await waitFor(() => expect(mocks.createNamedVault).toHaveBeenCalledWith('New vault'))
    expect(mocks.save).toHaveBeenCalledWith('new-vault', { title: 'Test credential', additions: {} }, 'new-vault')
    expect(onSaved).toHaveBeenCalledWith({ vaultId: 'new-vault', entryId: 'saved-entry' })
  })

  it('keeps the dialog and copy when new Vault creation fails', async () => {
    mocks.state.vaults = []
    mocks.createNamedVault.mockResolvedValue('failed')
    const onSaved = vi.fn()
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={onSaved} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('New vault name'), 'New vault')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.error).toHaveBeenCalledWith('The vault could not be created or confirmed. Retry here without closing this tab.')
    expect(mocks.success).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not offer creation on a failed Vault list and labels its non-destructive request retry', async () => {
    mocks.state.vaults = []; mocks.state.loadError = true
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Destination vault')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.retryLoad).toHaveBeenCalledOnce()
    expect(mocks.createNamedVault).not.toHaveBeenCalled()
  })

  it('disables creation, editing and closing while preparing the Vault', () => {
    mocks.state.vaults = []; mocks.state.busy = true
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText('New vault name')).toBeDisabled()
    expect(screen.getByLabelText('Copy title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('requires an explicit Vault choice and saves only on submit', async () => {
    const onSaved = vi.fn()
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={onSaved} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('The copy will appear in Agent Discovery')
    expect(screen.getByRole('button', { name: 'Save to my vault' })).toBeDisabled()
    expect(mocks.save).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
    expect(mocks.success).toHaveBeenCalledWith('Copy saved to your vault')
    expect(onSaved).toHaveBeenCalledWith({ vaultId: 'target', entryId: 'saved-entry' })
  })

  it('does not turn a near-match into creation and permits deliberate same-name creation', async () => {
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal ')
    expect(screen.getByRole('button', { name: 'Save to my vault' })).toBeDisabled()
    expect(mocks.createNamedVault).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'New vault' }))
    await userEvent.type(screen.getByLabelText('New vault name'), 'Personal')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.createNamedVault).toHaveBeenCalledWith('Personal')
  })

  it('keeps a corrupt Vault visible but unavailable while healthy siblings remain selectable', async () => {
    mocks.state.vaults = [{ id: 'corrupt-vault-identifier', name: null }, { id: 'target', name: 'Personal' }]
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Unavailable vault/)).toHaveAttribute('aria-disabled', 'true')
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
  })

  it('freezes an uncertain Vault create to the exact retry and prevents dismissing the copy', async () => {
    const props = { snapshot: fixture.snapshot as EntryShareSnapshot, onSaved: vi.fn(), onClose: vi.fn() }
    const view = render(<SaveShareCopyDialog {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'New vault' }))
    await userEvent.type(screen.getByLabelText('New vault name'), 'New vault')
    mocks.state.pendingVaultName = 'New vault'
    view.rerender(<SaveShareCopyDialog {...props} />)
    expect(screen.getByLabelText('New vault name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Existing vault' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Retry creating this vault' }))
    expect(mocks.createNamedVault).toHaveBeenCalledWith('New vault')
    expect(screen.getByRole('dialog')).toHaveTextContent('Vault creation may have succeeded')
  })

  it('retains the received copy after a failed save without showing raw errors', async () => {
    mocks.save.mockResolvedValue('failed')
    const onSaved = vi.fn()
    render(<SaveShareCopyDialog snapshot={fixture.snapshot as EntryShareSnapshot} onSaved={onSaved} onClose={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal')
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
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal')
    expect(screen.getByRole('button', { name: 'Save to my vault' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Cardholder'), 'Example User')
    await userEvent.type(screen.getByLabelText('Expiry month'), '12')
    await userEvent.type(screen.getByLabelText('Expiry year'), '2030')
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    expect(mocks.save).toHaveBeenCalledWith('target', { title: 'Card copy', additions: {
      'creditCard.cardholderName': 'Example User', 'creditCard.expiryMonth': '12', 'creditCard.expiryYear': '2030' } })
  })
})
