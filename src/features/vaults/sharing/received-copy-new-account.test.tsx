import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import i18n from '../../../shared/lib/i18n'
import { captureEntryShareIngress, clearPendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { duringManualLoginCleanup } from '../../../shared/lib/manual-login-cleanup'
import { entryShareFragment } from '../../../shared/crypto/entry-share-link'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import type { EntryShareCopyVault } from '../../../shared/crypto/entry-share-copy-encryption'
import type { CreateVaultProtocolPayload } from '../../../shared/crypto/create-vault-protocol'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'
import { EntryShareReceiverPage } from './entry-share-receiver-page'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ open: vi.fn(), receive: vi.fn(), confirm: vi.fn(), list: vi.fn(), get: vi.fn(),
  vaultChallenge: vi.fn(), entryChallenge: vi.fn(), account: vi.fn(), createDefaultVault: vi.fn(), createEntry: vi.fn() }))
vi.mock('./recipient-api', () => ({ openRecipientSession: api.open, receiveEntryShare: api.receive,
  confirmRecipientDisplay: api.confirm, requestRecipientOtp: vi.fn(), verifyRecipientOtp: vi.fn(),
  verifyRecipientSecret: vi.fn(), endRecipientShare: vi.fn() }))
vi.mock('../sync/member-sync-api', () => ({ listEncryptedVaults: api.list, getEncryptedVault: api.get }))
vi.mock('../api/vault-api', () => ({ issueVaultCreationChallenge: api.vaultChallenge,
  issueEntryCreationChallenge: api.entryChallenge, createEntry: api.createEntry, createVault: vi.fn() }))
vi.mock('../../../shared/api/account-api', () => ({ getAccount: api.account, createDefaultVault: api.createDefaultVault }))

const organizationId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'
const memberId = '33333333-3333-4333-8333-333333333333'
const entryId = '44444444-4444-4444-8444-444444444444'
const shareId = fixture.scope.shareId
let destination: EntryShareCopyVault | undefined

beforeEach(async () => {
  vi.resetAllMocks(); destination = undefined
  await i18n.changeLanguage('en')
  useAuthStore.setState({ userId: null, accessToken: null, sessionId: null, emailVerified: false,
    privateKey: null, permissions: 0, isVaultLocked: true, cryptoSessionGeneration: 0 })
  const fragment = entryShareFragment({ key: Uint8Array.from({ length: 32 }, (_, i) => i), accessToken: new Uint8Array(32).fill(7) })
  window.history.replaceState(null, '', `/share/${shareId}${fragment}`)
  captureEntryShareIngress(window)
  api.open.mockResolvedValue({ sessionId: '44442233-4455-4677-8899-aabbccddeeff', sessionToken: 's'.repeat(43),
    recipientMode: 'anyoneWithLink', protection: 'none', expiresAt: new Date(Date.now() + 900_000).toISOString() })
  api.receive.mockResolvedValueOnce({ ...fixture.scope, nonce: fixture.nonce, ciphertext: fixture.ciphertext })
    .mockRejectedValue(new Error('One receipt only'))
  api.vaultChallenge.mockResolvedValue({ vaultId })
  api.entryChallenge.mockResolvedValue({ entryId })
  api.account.mockResolvedValue({ userId: memberId, memberKeyVersion: 1 })
  api.list.mockImplementation(async () => destination ? [{ ...destination, isDefault: true }] : [])
  api.get.mockImplementation(async () => destination)
  api.createDefaultVault.mockImplementation(async (payload: CreateVaultProtocolPayload) => {
    destination = { ...payload, id: vaultId, organizationId, memberVaultKey: payload.creatorVaultKey, memberKeyGeneration: 1 }
  })
  api.createEntry.mockResolvedValue({ id: entryId, currentRevision: '1' })
})
afterEach(() => { cleanup(); clearPendingEntryShare() })

it('keeps one guest receipt through registration, explicit fresh Vault creation and independently decryptable Entry save', async () => {
  const navigate = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const page = render(<QueryClientProvider client={queryClient}><EntryShareReceiverPage shareId={shareId}
    onContinueToAccount={navigate} /></QueryClientProvider>)

  await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce())
  await userEvent.click(screen.getByRole('button', { name: 'Save to Palladin' }))
  expect(navigate).toHaveBeenCalledWith('register')
  page.unmount()
  // Auth transport is substituted; the receive, continuation, save hooks and crypto are real.
  act(() => {
    duringManualLoginCleanup(() => useAuthStore.getState().logout())
    useAuthStore.getState().setTokens({ userId: memberId,
      accessToken: `h.${btoa(JSON.stringify({ sub: memberId, org_id: organizationId }))}.s`,
      sessionId: 'synthetic-refresh', emailVerified: false, isOnboarded: true, permissions: 8 })
    useAuthStore.getState().markEmailVerified()
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(8), new Uint8Array(32).fill(7))
  })
  render(<QueryClientProvider client={queryClient}><EntryShareReceiverPage shareId={shareId}
    onContinueToAccount={navigate} /></QueryClientProvider>)
  await userEvent.click(await screen.findByRole('button', { name: 'Save to my vault' }))
  await screen.findByRole('dialog', { name: 'Save a copy to your vault' })
  expect(api.createDefaultVault).not.toHaveBeenCalled()
  await userEvent.type(screen.getByLabelText('New vault name'), 'Personal')
  expect(api.createEntry).not.toHaveBeenCalled()
  await userEvent.click(screen.getAllByRole('button', { name: 'Save to my vault' }).at(-1)!)
  await waitFor(() => expect(api.createDefaultVault).toHaveBeenCalledOnce())
  await waitFor(() => expect(api.createEntry).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(api.createEntry.mock.calls[0][0]).toBe(vaultId)
  expect(api.open).toHaveBeenCalledOnce()
  expect(api.receive).toHaveBeenCalledOnce()
  expect(api.confirm).toHaveBeenCalledOnce()
  expect(window.location.hash).toBe('')
  expect(window.location.search).toBe('')
  const request = api.createEntry.mock.calls[0][1]
  expect(JSON.stringify([api.createDefaultVault.mock.calls[0][0], request])).not.toContain('fixture-only')
  const vaultKey = await openMemberVaultKey(destination!.memberVaultKey, useAuthStore.getState().privateKey!)
  try {
    const saved = await openMemberSecret(request.entryKey, request.memberSecret, vaultKey,
      { organizationId, vaultId, entryId, revision: '1' })
    expect(saved).toMatchObject({ memberLabel: 'Test credential', discoverable: true,
      content: { password: 'fixture-only' } })
    expect(request.agentDiscovery).not.toBeNull()
  } finally { wipe(vaultKey) }
})
