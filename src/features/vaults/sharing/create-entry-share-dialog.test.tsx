import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEntryShareDialog } from './create-entry-share-dialog'
import { sharingScope, sharingSource } from './sharing-test-fixtures'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), submit: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('./use-share-creation', () => ({ useShareCreation: mocks.hook }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.submit.mockResolvedValue('created')
  mocks.hook.mockReturnValue({ source: sharingSource, loadError: false, busy: false, retryPending: false,
    link: null, submit: mocks.submit, retryLoad: vi.fn() })
})

function mount() {
  return render(<CreateEntryShareDialog scope={sharingScope} onClose={vi.fn()} onCreated={vi.fn()} />)
}
async function confirmForm() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Recipient email'), 'recipient@example.test')
  await user.click(screen.getByRole('switch', { name: 'I have checked the title and selected fields' }))
  return user
}

describe('Create sharing dialog', () => {
  it('renders safe defaults and requires review of the selected fields', () => {
    mount()
    expect(screen.getByLabelText('Who can receive this copy?')).toHaveValue('namedRecipient')
    expect(screen.getByLabelText('Additional protection')).toHaveValue('none')
    expect(screen.getByLabelText('Link lifetime')).toHaveValue('24')
    expect(screen.getByLabelText('Receipt limit')).toHaveValue('1')
    expect(screen.getByRole('switch', { name: 'Include Private notes' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeDisabled()
  })

  it('submits an explicitly reviewed selection with opt-in first receipt', async () => {
    mount()
    const user = await confirmForm()
    await user.click(screen.getByRole('switch', { name: 'Notify me of the first receipt' }))
    await user.click(screen.getByRole('button', { name: 'Create sharing link' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      recipientMode: 'namedRecipient', recipientEmail: 'recipient@example.test', protection: 'none', notifyOnFirstReceipt: true,
    }), ['credential.username', 'credential.password']))
    expect(mocks.success).toHaveBeenCalledWith('Sharing link created')
  })

  it('supports optional PIN and resets field confirmation when selection changes', async () => {
    mount()
    const user = await confirmForm()
    await user.selectOptions(screen.getByLabelText('Additional protection'), 'pin')
    await user.type(screen.getByLabelText('PIN', { selector: 'input' }), '123')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeDisabled()
    await user.type(screen.getByLabelText('PIN', { selector: 'input' }), '456')
    await user.click(screen.getByRole('switch', { name: 'Include Private notes' }))
    expect(screen.getByRole('switch', { name: 'I have checked the title and selected fields' })).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('switch', { name: 'I have checked the title and selected fields' }))
    await user.click(screen.getByRole('button', { name: 'Create sharing link' }))
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ protection: 'pin', protectionSecret: '123456' }),
      ['credential.username', 'credential.password', 'notes'])
  })

  it('warns about shared access/limit in anyone-with-link mode and requires no email', async () => {
    mount()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Who can receive this copy?'), 'anyoneWithLink')
    expect(screen.queryByLabelText('Recipient email')).not.toBeInTheDocument()
    expect(screen.getByText(/All recipients share one receipt limit/)).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'I have checked the title and selected fields' }))
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeEnabled()
  })

  it('surfaces API failures through the standard toast without leaking an error object', async () => {
    mocks.submit.mockResolvedValue('failed')
    mount()
    const user = await confirmForm()
    await user.click(screen.getByRole('button', { name: 'Create sharing link' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('The link could not be confirmed. Retry or close and check the sharing list.'))
    expect(screen.getByLabelText('Recipient email')).toHaveValue('recipient@example.test')
  })

  it('locks draft edits while an ambiguous creation is waiting for exact retry', () => {
    mocks.hook.mockReturnValue({ source: sharingSource, loadError: false, busy: false, retryPending: true,
      link: null, submit: mocks.submit, retryLoad: vi.fn() })
    mount()
    expect(screen.getByLabelText('Recipient email')).toBeDisabled()
    expect(screen.getByLabelText('Additional protection')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry the same request' })).toBeEnabled()
  })
})
