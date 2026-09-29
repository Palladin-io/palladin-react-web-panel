import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateEntryShareDialog } from './create-entry-share-dialog'
import { sharingScope, sharingSource } from './sharing-test-fixtures'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), submit: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('./use-share-creation', () => ({ useShareCreation: mocks.hook }))
vi.mock('../use-vault', () => ({ useVault: () => ({ data: { name: 'Personal vault', icon: 'shield', color: null } }) }))
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
  await user.click(screen.getByRole('button', { name: /Recipient: Anyone with the link/ }))
  await user.selectOptions(screen.getByLabelText('Who can receive this copy?'), 'namedRecipient')
  await user.type(screen.getByLabelText('Recipient email'), 'recipient@example.test')
  return user
}

describe('Create sharing dialog', () => {
  it('renders safe defaults without field selection or confirmation controls', () => {
    mount()
    expect(screen.getByText('Personal vault')).toBeVisible()
    expect(screen.getByText('Example login')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Entry' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Who can receive this copy?')).toHaveValue('anyoneWithLink')
    expect(screen.getByLabelText('Additional protection')).toHaveValue('none')
    expect(screen.getByLabelText('Link lifetime')).toHaveValue('24')
    expect(screen.getByLabelText('Receipt limit')).toHaveValue('')
    expect(screen.getByLabelText('Receipt limit')).not.toBeVisible()
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(4)
    expect(screen.getAllByRole('switch')).toHaveLength(1)
    expect(screen.getByText(/Shares the entire entry/)).toBeInTheDocument()
    expect(screen.queryByText('Choose the fields to share')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeEnabled()
  })

  it('submits whole-entry sharing with opt-in first receipt and no field IDs', async () => {
    mount()
    const user = await confirmForm()
    await user.click(screen.getByRole('switch', { name: 'Notify me of the first receipt' }))
    await user.click(screen.getByRole('button', { name: 'Create sharing link' }))
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({
      recipientMode: 'namedRecipient', recipientEmail: 'recipient@example.test', protection: 'none', notifyOnFirstReceipt: true,
    })))
    expect(mocks.submit.mock.calls[0]).toHaveLength(1)
    expect(mocks.success).toHaveBeenCalledWith('Sharing link created')
  })

  it('requires confirmation of the optional PIN and rejects obvious sequences', async () => {
    mount()
    const user = await confirmForm()
    await user.click(screen.getByRole('button', { name: /Security: None/ }))
    await user.selectOptions(screen.getByLabelText('Additional protection'), 'pin')
    await user.type(screen.getByLabelText('PIN', { selector: 'input' }), '123')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeDisabled()
    await user.type(screen.getByLabelText('PIN', { selector: 'input' }), '456')
    await user.type(screen.getByLabelText('Confirm password or PIN'), '123456')
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeDisabled()
    await user.clear(screen.getByLabelText('PIN', { selector: 'input' }))
    await user.type(screen.getByLabelText('PIN', { selector: 'input' }), '739284')
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeDisabled()
    await user.clear(screen.getByLabelText('Confirm password or PIN'))
    await user.type(screen.getByLabelText('Confirm password or PIN'), '739284')
    await user.click(screen.getByRole('button', { name: 'Create sharing link' }))
    expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ protection: 'pin', protectionSecret: '739284' }))
    expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty('confirmation')
  })

  it('warns about shared access/limit in anyone-with-link mode and requires no email', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Recipient: Anyone with the link/ }))
    await user.selectOptions(screen.getByLabelText('Who can receive this copy?'), 'anyoneWithLink')
    expect(screen.queryByLabelText('Recipient email')).not.toBeInTheDocument()
    expect(screen.getByText(/All recipients share one receipt limit/)).toBeInTheDocument()
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

  it('blocks sharing the entire entry when a custom field is unsupported', async () => {
    mocks.hook.mockReturnValue({ source: { ...sharingSource, content: { ...sharingSource.content,
      customFields: [{ id: 'custom:future', label: 'Future field', type: 'future', value: {} }],
    } }, loadError: false, busy: false, retryPending: false, link: null, submit: mocks.submit })
    mount()
    await confirmForm()
    expect(screen.getByText(/This entry cannot be shared in full yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create sharing link' })).toBeDisabled()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('locks draft edits while an ambiguous creation is waiting for exact retry', () => {
    mocks.hook.mockReturnValue({ source: sharingSource, loadError: false, busy: false, retryPending: true,
      link: null, submit: mocks.submit, retryLoad: vi.fn() })
    mount()
    expect(screen.getByLabelText('Who can receive this copy?')).toBeDisabled()
    expect(screen.getByLabelText('Additional protection')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Retry the same request' })).toBeEnabled()
  })
})
