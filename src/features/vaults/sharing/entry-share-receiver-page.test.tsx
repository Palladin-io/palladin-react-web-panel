import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import i18n from '../../../shared/lib/i18n'
import { captureEntryShareIngress, clearPendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { entryShareFragment } from '../../../shared/crypto/entry-share-link'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import { EntryShareReceiverPage } from './entry-share-receiver-page'
import { duringManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'
import { prepareEntryShare } from '../../../shared/crypto/entry-share'
import { env } from '../../../shared/lib/env'

const api = vi.hoisted(() => ({ open: vi.fn(), otp: vi.fn(), verifyOtp: vi.fn(), verifyAccount: vi.fn(), secret: vi.fn(), receive: vi.fn(), confirm: vi.fn(), end: vi.fn(), error: vi.fn(), save: vi.fn(), success: vi.fn() }))
const extension = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./extension-share-save', () => ({ requestExtensionShareSave: extension.request }))
vi.mock('./recipient-api', () => ({ openRecipientSession: api.open, requestRecipientOtp: api.otp,
  verifyRecipientOtp: api.verifyOtp, verifyRecipientSecret: api.secret, receiveEntryShare: api.receive,
  confirmRecipientDisplay: api.confirm, verifyRecipientAccount: api.verifyAccount }))
vi.mock('sonner', () => ({ toast: { error: api.error, success: api.success } }))
vi.mock('./use-save-share-copy', () => ({ useSaveShareCopy: () => ({
  vaults: [{ id: 'target', name: 'Personal' }], loading: false, loadError: false,
  busy: false, retryPending: false, saved: false, save: api.save, retryLoad: vi.fn(),
}) }))
vi.mock('../use-create-vault', () => ({ useCreateVault: () => ({ mutateAsync: vi.fn(), isPending: false, pendingInput: null }) }))

const shareId = fixture.scope.shareId
const session = { sessionId: '44442233-4455-4677-8899-aabbccddeeff', sessionToken: 's'.repeat(43),
  recipientMode: 'anyoneWithLink', protection: 'none' }
const originalStoreUrls = { apple: env.appleAppStoreUrl, android: env.googlePlayStoreUrl }

beforeEach(async () => {
  vi.resetAllMocks()
  extension.request.mockResolvedValue('unavailable')
  await i18n.changeLanguage('en')
  useAuthStore.setState({ userId: null, accessToken: null, refreshToken: null, emailVerified: false, privateKey: null, permissions: 0, isVaultLocked: true, cryptoSessionGeneration: 0 })
  const fragment = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(7) })
  window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
  captureEntryShareIngress(window)
  api.open.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 900_000).toISOString() })
  api.otp.mockResolvedValue({ retryAfterSeconds: 0 })
  api.receive.mockResolvedValue({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext })
  api.save.mockResolvedValue({ vaultId: 'target', entryId: 'saved-entry' })
})
afterEach(() => {
  cleanup(); clearPendingEntryShare(); vi.restoreAllMocks()
  Object.defineProperty(env, 'appleAppStoreUrl', { value: originalStoreUrls.apple, configurable: true })
  Object.defineProperty(env, 'googlePlayStoreUrl', { value: originalStoreUrls.android, configurable: true })
})

async function open() {
  render(<EntryShareReceiverPage shareId={shareId} />)
  await waitFor(() => expect(api.open).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
}

describe('Public sharing receiver', () => {
  it('offers extension-owned confirmation without reopening an already received link', async () => {
    extension.request.mockImplementation(async (type: string) => type === 'status' ? 'ready' : 'pending')
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Save in Palladin extension' }))
    expect(extension.request).toHaveBeenCalledWith('prepare', expect.objectContaining({ title: 'Test credential' }))
    expect(screen.getByText(/Confirm the save in the Palladin extension/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save to Palladin' })).not.toBeInTheDocument()
    expect(api.receive).toHaveBeenCalledOnce()
  })
  it('keeps automatic receipt on mobile and uses a clean store fallback without claiming app detection', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    Object.defineProperty(env, 'appleAppStoreUrl', { value: 'https://apps.apple.com/app/example/id123456789', configurable: true })
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={vi.fn()} />)
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
    const download = screen.getByRole('link', { name: 'Get the Palladin app' })
    expect(download).toHaveAttribute('href', 'https://apps.apple.com/app/example/id123456789')
    expect(download).toHaveAttribute('rel', 'noopener noreferrer')
    expect(download).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByText(/Save this copy to your Palladin account here first/)).toBeInTheDocument()
    expect(screen.getByText(/Keep this tab open/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check link' })).not.toBeInTheDocument()
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it('does not show store links when no reviewed URL is configured', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android')
    Object.defineProperty(env, 'googlePlayStoreUrl', { value: '', configurable: true })
    await open()
    expect(screen.queryByRole('link', { name: 'Get the Palladin app' })).not.toBeInTheDocument()
  })

  it('copies without revealing and reports success through the panel toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await open()
    await screen.findByLabelText('Password')
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('fixture-only'))
    await waitFor(() => expect(api.success).toHaveBeenCalled())
    expect(api.success).toHaveBeenCalledWith('Copied to clipboard', { id: 'clipboard-copy' })
    expect(screen.getByLabelText('Password')).toHaveClass('secret-mask')
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it.each(['notes', 'script.source'])('opens %s in a separate, dismissible dialog', async (id) => {
    const packet = await prepareEntryShare(fixture.scope, { schema: 'palladin.entry-share.v1',
      entryType: id === 'notes' ? 'credential' : 'script', title: 'Synthetic multiline',
      fields: [{ id, label: 'Full text', type: 'multiline', value: 'Synthetic line one\nSynthetic line two' }] })
    window.history.replaceState(null, '', `/share/${shareId}${entryShareFragment(packet)}`)
    captureEntryShareIngress(window)
    api.receive.mockResolvedValue({ ...fixture.scope, nonce: packet.nonce, ciphertext: packet.ciphertext })
    await open()
    const label = id === 'notes' ? 'Private notes' : 'Script source'
    expect(await screen.findByLabelText(label)).toHaveClass('secret-mask')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))
    const dialog = screen.getByRole('dialog', { name: label })
    expect(dialog).toHaveTextContent('Synthetic line one')
    expect(screen.getByRole('textbox', { name: label })).toHaveClass('secret-mask')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.receive).toHaveBeenCalledOnce()
  })
  it('opens and receives only once under StrictMode effect replay', async () => {
    render(<StrictMode><EntryShareReceiverPage shareId={shareId} /></StrictMode>)
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.save).not.toHaveBeenCalled()
  })

  it('does not request a recipient session without the full capability', () => {
    clearPendingEntryShare()
    render(<EntryShareReceiverPage shareId={shareId} />)
    expect(screen.getByText(/Reopen the original full link/)).toBeInTheDocument()
    expect(api.open).not.toHaveBeenCalled()
    expect(api.receive).not.toHaveBeenCalled()
  })

  it('uses the shared auth brand, no receiver heading and one save action', async () => {
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={vi.fn()} />)
    const password = await screen.findByLabelText('Password')
    expect(password).toHaveClass('secret-mask')
    expect(screen.queryByRole('heading', { name: 'Receive a shared entry' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Palladin.io' }).closest('header')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Palladin.io' }).parentElement?.parentElement).toHaveClass('share-reception-card')
    expect(password.parentElement).toHaveClass('flex', 'gap-2')
    expect(screen.queryByRole('button', { name: 'Check link' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show entry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save to Palladin' })).toHaveClass('flex-1', 'h-action')
    expect(screen.getByTestId('modal-footer').querySelectorAll('button')).toHaveLength(1)
    expect(password.closest('.share-received-data')).toContainElement(screen.getByRole('heading', { name: 'Test credential' }))
    expect(screen.getByRole('link', { name: 'Discover Palladin' }).closest('.share-reception-card')).toBeInTheDocument()
    for (const [name, href] of [['Discover Palladin', 'https://palladin.io/'], ['Privacy', 'https://palladin.io/privacy/'], ['Terms', 'https://palladin.io/terms/']]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    }
  })

  it('does not ask a locked web account to unlock before opening the shared entry', async () => {
    useAuthStore.setState({ userId: 'recipient', refreshToken: 'synthetic-refresh', emailVerified: true,
      isVaultLocked: true, privateKey: null })
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={vi.fn()} />)
    expect(screen.queryByText('Want to save a copy in your vault?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unlock to save' })).not.toBeInTheDocument()
    await screen.findByLabelText('Password')
    expect(await screen.findByRole('button', { name: 'Unlock to save' })).toBeEnabled()
  })

  it('adopts an initial verified extension unlock and offers save without saving automatically', async () => {
    render(<EntryShareReceiverPage shareId={shareId} />)
    await screen.findByLabelText('Password')
    act(() => useAuthStore.setState({ userId: 'recipient', accessToken: 'synthetic-own-jwt',
      privateKey: new Uint8Array(32), isVaultLocked: false, emailVerified: true, permissions: 8, cryptoSessionGeneration: 1 }))
    await userEvent.click(await screen.findByRole('button', { name: 'Save to my vault' }))
    await screen.findByRole('dialog', { name: 'Save a copy to your vault' })
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.save).not.toHaveBeenCalled()
    act(() => useAuthStore.getState().lockVault())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it.each(['none', 'pin'])('requires authoritative account verification and preserves %s protection', async (protection) => {
    useAuthStore.setState({ userId: 'recipient', accessToken: 'synthetic-own-jwt', privateKey: new Uint8Array(32),
      isVaultLocked: false, emailVerified: true, permissions: 8 })
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', protection,
      expiresAt: new Date(Date.now() + 900_000).toISOString() })
    render(<EntryShareReceiverPage shareId={shareId} />)
    await waitFor(() => expect(api.verifyAccount).toHaveBeenCalledOnce())
    expect(api.verifyAccount.mock.calls[0][2]).toBe('synthetic-own-jwt')
    expect(api.otp).not.toHaveBeenCalled()
    if (protection === 'pin') {
      expect(api.receive).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('PIN'), '123456')
      await userEvent.click(screen.getByRole('button', { name: 'Verify additional secret' }))
    }
    await userEvent.click(await screen.findByRole('button', { name: 'Save to my vault' }))
    await screen.findByRole('dialog', { name: 'Save a copy to your vault' })
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.save).not.toHaveBeenCalled()
  })

  it('keeps OTP available when the authenticated account does not match', async () => {
    useAuthStore.setState({ userId: 'recipient', accessToken: 'synthetic-own-jwt', privateKey: new Uint8Array(32),
      isVaultLocked: false, emailVerified: true, permissions: 8 })
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.verifyAccount.mockRejectedValue(new Error('denied'))
    render(<EntryShareReceiverPage shareId={shareId} />)
    await waitFor(() => expect(api.verifyAccount).toHaveBeenCalledOnce())
    expect(await screen.findByRole('button', { name: 'Send verification code' })).toBeEnabled()
    expect(api.receive).not.toHaveBeenCalled()
    expect(api.otp).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows link policy before receipt, but only shows the entry type after decryption', async () => {
    const expiresAt = new Date(Date.now() + 900_000).toISOString()
    const shareExpiresAt = new Date(Date.now() + 86_400_000).toISOString()
    api.open.mockResolvedValue({ ...session, protection: 'pin', expiresAt, shareExpiresAt, maximumReceipts: 3 })
    await open()
    expect(screen.getByText('Link expires')).toBeInTheDocument()
    expect(screen.getByText('in 1 day')).toBeInTheDocument()
    expect(screen.queryByText(new Date(expiresAt).toLocaleString('en'))).not.toBeInTheDocument()
    expect(screen.getByText('Receipt limit')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.queryByText('Credential')).not.toBeInTheDocument()
    expect(api.receive).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('PIN'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify additional secret' }))
    expect(await screen.findByText('Credential')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveClass('secret-mask')
    expect(screen.getByText('Link expires').closest('.subtle-scrollbar')).toContainElement(screen.getByLabelText('Password'))
  })

  it('does not mislabel session expiry as link expiry when policy metadata is absent', async () => {
    await open()
    expect(screen.queryByText('Link expires')).not.toBeInTheDocument()
    expect(screen.queryByText('Receipt limit')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
  })

  it('disables initial sending during another session’s cooldown without offering verification for an unsent generation', async () => {
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString(), otpRetryAfterSeconds: 39 })
    await open()
    expect(screen.getByRole('button', { name: 'Request code in 39 s' })).toBeDisabled()
    expect(screen.queryByLabelText('Email verification code')).not.toBeInTheDocument()
    expect(api.otp).not.toHaveBeenCalled()
  })

  it('localizes the countdown in Polish while allowing the already sent code to be verified', async () => {
    await i18n.changeLanguage('pl')
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.otp.mockResolvedValue({ retryAfterSeconds: 60 })
    render(<EntryShareReceiverPage shareId={shareId} />)
    await screen.findByRole('button', { name: 'Wyślij kod weryfikacyjny' })
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij kod weryfikacyjny' }))
    expect(screen.getByRole('button', { name: 'Poproś o kod za 60 s' })).toBeDisabled()
    expect(screen.getByLabelText(i18n.t('sharing.receiver.otpCode'))).toBeEnabled()
    expect(api.otp).toHaveBeenCalledOnce()
  })

  it('restarts a same-ID replacement and automatically receives only the new capability', async () => {
    await open()
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))
    const previousSignal = api.open.mock.calls[0][2] as AbortSignal
    act(() => {
      const replacement = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(8) })
      window.history.replaceState(null, '', `/share/${shareId}${replacement}`)
      captureEntryShareIngress(window)
    })
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(previousSignal.aborted).toBe(true)
    await screen.findByLabelText('Password')
    expect(api.open).toHaveBeenCalledTimes(2)
    expect(api.open.mock.calls[1][1]).not.toBe(api.open.mock.calls[0][1])
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
    expect(api.receive).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2))
  })

  it('defers account continuation until after the guest has received the entry', async () => {
    const navigate = vi.fn()
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={navigate} />)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('saves an already received guest copy after account continuation without redelivery or another ACK', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    Object.defineProperty(env, 'appleAppStoreUrl', { value: 'https://apps.apple.com/app/example/id123456789', configurable: true })
    const navigate = vi.fn()
    const openSaved = vi.fn()
    const page = render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={navigate} />)
    await screen.findByLabelText('Password')
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    expect(screen.getAllByRole('button').filter((button) => button.closest('[data-testid="modal-footer"]'))).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Save to Palladin' }))
    expect(navigate).toHaveBeenCalledWith('register')
    page.unmount()
    act(() => {
      duringManualLoginCleanup(() => useAuthStore.getState().logout())
      useAuthStore.getState().setTokens({ userId: 'recipient', accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh', emailVerified: true, isOnboarded: true, permissions: 8 })
      useAuthStore.getState().unlockVault(new Uint8Array(32), new Uint8Array(32))
    })
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={navigate} onSavedToEntry={openSaved} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Save to my vault' }))
    expect(await screen.findByRole('dialog', { name: 'Save a copy to your vault' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save to my vault' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Saved to your account. Sign in to the mobile app with the same account')
    expect(screen.getByText(/Sign in to the app with this same Palladin account/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get the Palladin app' })).toHaveAttribute('href', 'https://apps.apple.com/app/example/id123456789')
    expect(api.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
    expect(openSaved).toHaveBeenCalledWith({ vaultId: 'target', entryId: 'saved-entry' })
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledOnce()
  })

  it('clears the copy after failed auth navigation without surfacing navigation diagnostics', async () => {
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={async () => { throw new Error('sensitive navigation detail') }} />)
    await screen.findByLabelText('Password')
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Save to Palladin' }))
    await waitFor(() => expect(screen.queryByLabelText('Password')).not.toBeInTheDocument())
    expect(api.error).toHaveBeenCalledWith(expect.stringContaining('The request could not be completed.'))
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it('opens and receives a basic guest link immediately without sending email', async () => {
    render(<EntryShareReceiverPage shareId={shareId} />)
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.otp).not.toHaveBeenCalled()
  })

  it('receives the basic share immediately without an intermediate step, masks fields and confirms after rendering', async () => {
    api.confirm.mockImplementation(async () => {
      expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
    })
    await open()
    expect(await screen.findByRole('heading', { name: 'Test credential' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveClass('secret-mask')
    expect(screen.queryByRole('button', { name: 'Show entry' })).not.toBeInTheDocument()
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(screen.getByLabelText('Password')).not.toHaveClass('secret-mask')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it('keeps an explicit delivery retry after a failed basic receipt without reopening or retrying automatically', async () => {
    api.receive.mockRejectedValueOnce(new Error('network'))
    await open()
    await waitFor(() => expect(api.error).toHaveBeenCalledOnce())
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Show entry' }))
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
  })

  it('offers both OTP and optional PIN verification before enabling receipt', async () => {
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', protection: 'pin', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    await open()
    expect(screen.getByRole('button', { name: 'Show entry' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('PIN'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify additional secret' }))
    expect(screen.getByText('Additional secret verified for this session.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show entry' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
    await userEvent.type(screen.getByLabelText('Email verification code'), '654321')
    await userEvent.click(screen.getByRole('button', { name: 'Verify email code' }))
    await screen.findByRole('heading', { name: 'Test credential' })
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.secret.mock.calls[0][2]).toBe('123456')
    expect(api.verifyOtp.mock.calls[0][3]).toBe('654321')
  })

  it('toasts a verification failure and keeps receipt disabled', async () => {
    api.open.mockResolvedValue({ ...session, protection: 'password', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    api.secret.mockRejectedValue(new Error('untrusted detail'))
    await open()
    await userEvent.type(screen.getByLabelText('Password'), 'test-password')
    await userEvent.click(screen.getByRole('button', { name: 'Verify additional secret' }))
    await waitFor(() => expect(api.error).toHaveBeenCalledWith(expect.stringContaining('The request could not be completed.')))
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Show entry' })).toBeDisabled()
    expect(screen.queryByText('untrusted detail')).not.toBeInTheDocument()
  })

  it('retains the displayed copy and offers only confirmation retry when ACK fails', async () => {
    api.confirm.mockRejectedValueOnce(new Error('network'))
    await open()
    const retry = await screen.findByRole('button', { name: 'Retry display confirmation' })
    expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
    await userEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry display confirmation' })).not.toBeInTheDocument())
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledTimes(2)
  })

  it('does not let a recipient end the entire link', async () => {
    await open()
    await screen.findByRole('heading', { name: 'Test credential' })
    expect(screen.queryByRole('button', { name: 'End sharing link' })).not.toBeInTheDocument()
    expect(api.end).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
  })

  it('removes revealed content on account replacement and explains a missing full link', async () => {
    await open()
    await screen.findByRole('heading', { name: 'Test credential' })
    act(() => useAuthStore.setState({ userId: 'another-account', cryptoSessionGeneration: 1 }))
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.getByText(/Reopen the original full link/)).toBeInTheDocument()
  })

  it('offers an explicit save action for an unlocked recipient without another receipt', async () => {
    useAuthStore.setState({ userId: 'recipient', accessToken: 'test-token', privateKey: new Uint8Array(32),
      isVaultLocked: false, emailVerified: true, permissions: 8 })
    render(<EntryShareReceiverPage shareId={shareId} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Save to my vault' }))
    await screen.findByRole('dialog', { name: 'Save a copy to your vault' })
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.type(screen.getByLabelText('Destination vault'), 'Personal')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save to my vault' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
    expect(screen.getByRole('button', { name: 'Copy saved to your vault' })).toBeDisabled()
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
  })
})
