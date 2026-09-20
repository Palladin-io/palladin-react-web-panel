import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { EntrySharingTab } from './entry-sharing-tab'
import { sharingId, sharingListItem, sharingScope, sharingTestAccessToken } from './sharing-test-fixtures'

const mocks = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('./sharing-api', () => ({ listEntryShares: mocks.list, revokeEntryShare: mocks.revoke }))
vi.mock('./create-entry-share-dialog', () => ({ CreateEntryShareDialog: () => <div role="dialog">Create surface</div> }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ userId: 'member', accessToken: sharingTestAccessToken(), isVaultLocked: false,
    privateKey: new Uint8Array(32).fill(9), cryptoSessionGeneration: 7, permissions: 8 })
  mocks.list.mockResolvedValue({ items: [sharingListItem], nextCursor: null })
  mocks.revoke.mockResolvedValue(undefined)
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><EntrySharingTab scope={sharingScope} /></QueryClientProvider>)
}

describe('Entry sharing list', () => {
  it('shows delivery counters separately from first confirmation and opens the create surface', async () => {
    mount()
    expect(await screen.findByText('recipient@example.test')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByText('First display confirmation')).toBeInTheDocument()
    expect(screen.getByText('No additional secret')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create sharing link' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Create surface')
  })

  it('requires confirmation before revoking and refreshes after success', async () => {
    mount()
    await screen.findByText('recipient@example.test')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Revoke link' }))
    expect(mocks.revoke).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('It does not erase downloaded copies')
    await user.click(screen.getAllByRole('button', { name: 'Revoke link' }).at(-1)!)
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith(sharingScope.vaultId, sharingScope.entryId, sharingId, expect.any(AbortSignal)))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocks.success).toHaveBeenCalledWith('Link revoked')
  })

  it('keeps the confirmation open after a revoke failure', async () => {
    mocks.revoke.mockRejectedValue(new Error('network'))
    mount()
    await screen.findByText('recipient@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Revoke link' }).at(-1)!)
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('The link could not be revoked. Try again.'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('retains an unknown state, shows the stale-copy warning and offers no guessed action', async () => {
    mocks.list.mockResolvedValue({ items: [{ ...sharingListItem, status: 'future', sourceChanged: true }], nextCursor: null })
    mount()
    expect(await screen.findByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('The source entry has changed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke link' })).not.toBeInTheDocument()
  })

  it('renders a failed query with retry and does not fetch without management permission', async () => {
    mocks.list.mockRejectedValue(new Error('network'))
    const view = mount()
    expect(await screen.findByText('Sharing links could not be loaded.')).toBeInTheDocument()
    view.unmount()
    mocks.list.mockClear()
    useAuthStore.setState({ permissions: 0 })
    mount()
    expect(screen.getByText('Unlock the vault and make sure you have permission to manage it.')).toBeInTheDocument()
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('unmounts the create dialog when the vault locks', async () => {
    mount()
    await screen.findByText('recipient@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Create sharing link' }))
    act(() => useAuthStore.setState({ isVaultLocked: true, cryptoSessionGeneration: 8 }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not query or render a previous organization after its token changes', async () => {
    mount()
    await screen.findByText('recipient@example.test')
    act(() => useAuthStore.setState({ accessToken: null }))
    expect(screen.queryByText('recipient@example.test')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create sharing link' })).not.toBeInTheDocument()
    expect(mocks.list).toHaveBeenCalledOnce()
  })

  it('drops the open dialog when the principal changes even without a generation change', async () => {
    mount()
    await screen.findByText('recipient@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Create sharing link' }))
    act(() => useAuthStore.setState({ userId: 'another-member' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['success', 'error'])('discards a late revoke %s after locking', async (outcome) => {
    let finish!: () => void
    mocks.revoke.mockReturnValue(new Promise<void>((resolve, reject) => {
      finish = () => outcome === 'success' ? resolve() : reject(new Error('network'))
    }))
    mount()
    await screen.findByText('recipient@example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Revoke link' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Revoke link' }).at(-1)!)
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce())
    const signal: AbortSignal = mocks.revoke.mock.calls[0][3]
    act(() => useAuthStore.setState({ isVaultLocked: true, cryptoSessionGeneration: 8 }))
    await act(async () => { finish() })
    expect(signal.aborted).toBe(true)
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.list).toHaveBeenCalledOnce()
  })
})
