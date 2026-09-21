import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import i18n from '../../../shared/lib/i18n'
import { captureEntryShareIngress, clearPendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { entryShareFragment } from '../../../shared/crypto/entry-share-link'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import { EntryShareReceiverPage } from './entry-share-receiver-page'
import { duringManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'

const api = vi.hoisted(() => ({ open: vi.fn(), otp: vi.fn(), verifyOtp: vi.fn(), secret: vi.fn(), receive: vi.fn(), confirm: vi.fn(), end: vi.fn(), error: vi.fn(), save: vi.fn(), success: vi.fn() }))
vi.mock('./recipient-api', () => ({ openRecipientSession: api.open, requestRecipientOtp: api.otp,
  verifyRecipientOtp: api.verifyOtp, verifyRecipientSecret: api.secret, receiveEntryShare: api.receive,
  confirmRecipientDisplay: api.confirm, endRecipientShare: api.end }))
vi.mock('sonner', () => ({ toast: { error: api.error, success: api.success } }))
vi.mock('./use-save-share-copy', () => ({ useSaveShareCopy: () => ({
  vaults: [{ id: 'target', name: 'Personal' }], loading: false, loadError: false,
  busy: false, retryPending: false, saved: false, save: api.save, retryLoad: vi.fn(),
}) }))

const shareId = fixture.scope.shareId
const session = { sessionId: '44442233-4455-4677-8899-aabbccddeeff', sessionToken: 's'.repeat(43),
  recipientMode: 'anyoneWithLink', protection: 'none' }

beforeEach(async () => {
  vi.resetAllMocks()
  await i18n.changeLanguage('en')
  useAuthStore.setState({ userId: null, accessToken: null, refreshToken: null, emailVerified: false, privateKey: null, permissions: 0, isVaultLocked: true, cryptoSessionGeneration: 0 })
  const fragment = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(7) })
  window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
  captureEntryShareIngress(window)
  api.open.mockResolvedValue({ ...session, expiresAt: new Date(Date.now() + 900_000).toISOString() })
  api.otp.mockResolvedValue({ retryAfterSeconds: 0 })
  api.receive.mockResolvedValue({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext })
  api.save.mockResolvedValue('saved')
})
afterEach(() => { cleanup(); clearPendingEntryShare() })

async function open() {
  render(<EntryShareReceiverPage shareId={shareId} />)
  await userEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))
}

describe('Public sharing receiver', () => {
  it('shows link policy before receipt, but only shows the entry type after decryption', async () => {
    const expiresAt = new Date(Date.now() + 900_000).toISOString()
    const shareExpiresAt = new Date(Date.now() + 86_400_000).toISOString()
    api.open.mockResolvedValue({ ...session, expiresAt, shareExpiresAt, maximumReceipts: 3 })
    await open()
    expect(screen.getByText('Link valid until')).toBeInTheDocument()
    expect(screen.getByText(new Date(shareExpiresAt).toLocaleString('en'))).toBeInTheDocument()
    expect(screen.queryByText(new Date(expiresAt).toLocaleString('en'))).not.toBeInTheDocument()
    expect(screen.getByText('Receipt limit')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText(/This receipt limit is shared/)).toBeInTheDocument()
    expect(screen.queryByText('Entry type: Credential')).not.toBeInTheDocument()
    expect(api.receive).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    expect(await screen.findByText('Entry type: Credential')).toBeInTheDocument()
  })

  it('does not mislabel session expiry as link expiry when policy metadata is absent', async () => {
    await open()
    expect(screen.queryByText('Link valid until')).not.toBeInTheDocument()
    expect(screen.queryByText('Receipt limit')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Receive entry' })).toBeEnabled()
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
    await userEvent.click(screen.getByRole('button', { name: i18n.t('sharing.receiver.open') }))
    await userEvent.click(screen.getByRole('button', { name: 'Wyślij kod weryfikacyjny' }))
    expect(screen.getByRole('button', { name: 'Poproś o kod za 60 s' })).toBeDisabled()
    expect(screen.getByLabelText(i18n.t('sharing.receiver.otpCode'))).toBeEnabled()
    expect(api.otp).toHaveBeenCalledOnce()
  })

  it('restarts a same-ID replacement without retaining a revealed field or issuing another receipt automatically', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
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
    await userEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))
    expect(api.open).toHaveBeenCalledTimes(2)
    expect(api.open.mock.calls[1][1]).not.toBe(api.open.mock.calls[0][1])
    expect(api.receive).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    expect(await screen.findByLabelText('Password')).toHaveClass('secret-mask')
    await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(2))
  })

  it.each([['Sign in', 'login'], ['Create an account', 'register']])('offers %s before any receipt', async (label, target) => {
    const navigate = vi.fn()
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={navigate} />)
    await userEvent.click(screen.getByRole('button', { name: label }))
    expect(navigate).toHaveBeenCalledExactlyOnceWith(target)
    expect(api.open).not.toHaveBeenCalled()
    expect(api.receive).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('')
  })

  it('saves an already received guest copy after account continuation without redelivery or another ACK', async () => {
    const navigate = vi.fn()
    const page = render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={navigate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(navigate).toHaveBeenCalledWith('login')
    page.unmount()
    act(() => {
      duringManualLoginCleanup(() => useAuthStore.getState().logout())
      useAuthStore.getState().setTokens({ userId: 'recipient', accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh', emailVerified: true, isOnboarded: true, permissions: 8 })
      useAuthStore.getState().unlockVault(new Uint8Array(32), new Uint8Array(32))
    })
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={navigate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    await userEvent.selectOptions(screen.getByLabelText('Destination vault'), 'target')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save to my vault' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledOnce()
  })

  it('clears the copy after failed auth navigation without surfacing navigation diagnostics', async () => {
    render(<EntryShareReceiverPage shareId={shareId} onContinueToAccount={async () => { throw new Error('sensitive navigation detail') }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Continue in browser' }))
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.queryByLabelText('Password')).not.toBeInTheDocument())
    expect(api.error).toHaveBeenCalledWith(expect.stringContaining('The request could not be completed.'))
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it('shows a guest flow without automatically opening a session, sending email or receiving', () => {
    render(<EntryShareReceiverPage shareId={shareId} />)
    expect(screen.getByRole('heading', { name: 'Receive a shared entry' })).toBeInTheDocument()
    expect(screen.getByText('You do not need a Palladin account to receive this copy.')).toBeInTheDocument()
    expect(api.open).not.toHaveBeenCalled()
    expect(api.otp).not.toHaveBeenCalled()
    expect(api.receive).not.toHaveBeenCalled()
  })

  it('receives on explicit action, masks the copied field and confirms after rendering it', async () => {
    api.confirm.mockImplementation(async () => {
      expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
    })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    expect(await screen.findByRole('heading', { name: 'Test credential' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveClass('secret-mask')
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Reveal' }))
    expect(screen.getByLabelText('Password')).not.toHaveClass('secret-mask')
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(api.receive).toHaveBeenCalledOnce()
  })

  it('offers both OTP and optional PIN verification before enabling receipt', async () => {
    api.open.mockResolvedValue({ ...session, recipientMode: 'namedRecipient', protection: 'pin', expiresAt: new Date(Date.now() + 900_000).toISOString() })
    await open()
    expect(screen.getByRole('button', { name: 'Receive entry' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('PIN'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify additional secret' }))
    expect(screen.getByText('Additional secret verified for this session.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Receive entry' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Send verification code' }))
    await userEvent.type(screen.getByLabelText('Email verification code'), '654321')
    await userEvent.click(screen.getByRole('button', { name: 'Verify email code' }))
    expect(screen.getByRole('button', { name: 'Receive entry' })).toBeEnabled()
    expect(api.receive).not.toHaveBeenCalled()
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
    expect(screen.getByRole('button', { name: 'Receive entry' })).toBeDisabled()
    expect(screen.queryByText('untrusted detail')).not.toBeInTheDocument()
  })

  it('retains the displayed copy and offers only confirmation retry when ACK fails', async () => {
    api.confirm.mockRejectedValueOnce(new Error('network'))
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    const retry = await screen.findByRole('button', { name: 'Retry display confirmation' })
    expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
    await userEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry display confirmation' })).not.toBeInTheDocument())
    expect(api.receive).toHaveBeenCalledOnce()
    expect(api.confirm).toHaveBeenCalledTimes(2)
  })

  it('requires confirmation to end the entire link and retains the displayed copy', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    await screen.findByRole('heading', { name: 'Test credential' })
    await userEvent.click(screen.getByRole('button', { name: 'End sharing link' }))
    expect(api.end).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('This ends the entire link for everyone')
    await userEvent.click(screen.getAllByRole('button', { name: 'End sharing link' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.end).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
  })

  it('removes revealed content on account replacement and explains a missing full link', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    await screen.findByRole('heading', { name: 'Test credential' })
    act(() => useAuthStore.setState({ userId: 'another-account', cryptoSessionGeneration: 1 }))
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
    expect(screen.getByText(/Reopen the original full link/)).toBeInTheDocument()
  })

  it.each([false, true])('saves an unlocked recipient copy without another receipt (ended=%s)', async (ended) => {
    useAuthStore.setState({ userId: 'recipient', accessToken: 'test-token', privateKey: new Uint8Array(32),
      isVaultLocked: false, emailVerified: true, permissions: 8 })
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Receive entry' }))
    await screen.findByRole('heading', { name: 'Test credential' })
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
    if (ended) {
      await userEvent.click(screen.getByRole('button', { name: 'End sharing link' }))
      await userEvent.click(screen.getAllByRole('button', { name: 'End sharing link' }).at(-1)!)
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    }
    await userEvent.click(screen.getByRole('button', { name: 'Save to my vault' }))
    await userEvent.selectOptions(screen.getByLabelText('Destination vault'), 'target')
    await userEvent.click(screen.getAllByRole('button', { name: 'Save to my vault' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.save).toHaveBeenCalledWith('target', { title: 'Test credential', additions: {} })
    expect(screen.getByRole('button', { name: 'Copy saved to your vault' })).toBeDisabled()
    expect(api.open).toHaveBeenCalledOnce()
    expect(api.receive).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Password')).toHaveValue('fixture-only')
  })
})
