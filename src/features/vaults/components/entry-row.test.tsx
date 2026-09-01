import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { EntryRow } from './entry-row'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, type EntryListItem } from '../types'

const {
  openCurrentEntryMock,
  structuralMismatch,
  writeTextMock,
  fetchMock,
} = vi.hoisted(() => ({
  openCurrentEntryMock: vi.fn(),
  structuralMismatch: new Error('structural head mismatch'),
  writeTextMock: vi.fn(async () => {}),
  fetchMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) =>
    <a {...props}>{children}</a>,
}))

vi.mock('../sync/current-member-entry-reader', () => ({
  openCurrentMemberEntrySecret: openCurrentEntryMock,
  isCurrentMemberEntryStructuralHeadMismatchError: (error: unknown) => error === structuralMismatch,
}))

vi.mock('../../../shared/crypto/entry-draft', () => ({
  fromMemberSecret: (secret: unknown) => ({ content: secret }),
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const KEY_ENTRY: EntryListItem & { currentRevision: string; currentKeyVersion: number } = {
  id: 'entry-1',
  label: 'Stripe API Key',
  type: ENTRY_TYPE_KEY,
  accessCount: 0,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
  currentRevision: '1',
  currentKeyVersion: 1,
}

describe('EntryRow — copy vs reveal', () => {
  beforeEach(() => {
    openCurrentEntryMock.mockReset()
    writeTextMock.mockClear()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    openCurrentEntryMock.mockResolvedValue({ type: ENTRY_TYPE_KEY, value: 'sk_live_secret' })
    useAuthStore.setState({
      userId: '11111111-1111-4111-8111-111111111111',
      privateKey: new Uint8Array(32),
      isVaultLocked: false,
    })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: writeTextMock } })
  })

  it('copies the secret WITHOUT opening the reveal panel', async () => {
    render(<EntryRow vaultId="vault-1" entry={KEY_ENTRY} />)

    // Reveal panel is closed: its Hide toggle must not be present yet.
    expect(screen.queryByRole('button', { name: /hide/i })).not.toBeInTheDocument()

    // fireEvent (not userEvent) so its clipboard stub doesn't shadow our mock.
    fireEvent.click(screen.getByRole('button', { name: /copy key/i }))

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('sk_live_secret'))
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
    // Copy must NOT expand the row — the reveal panel stays closed.
    expect(screen.queryByRole('button', { name: /hide/i })).not.toBeInTheDocument()
  })

  it('opens the reveal panel only when the reveal action is clicked', async () => {
    const user = userEvent.setup()
    render(<EntryRow vaultId="vault-1" entry={KEY_ENTRY} />)

    await user.click(screen.getByRole('button', { name: /^reveal$/i }))

    expect(await screen.findByRole('button', { name: /hide/i })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('derives TOTP from the locally opened credential without HTTP', async () => {
    openCurrentEntryMock.mockResolvedValue({
      type: ENTRY_TYPE_CREDENTIAL,
      username: 'fixture-user',
      password: 'fixture-password',
      totp: 'otpauth://totp/Palladin:fixture?secret=JBSWY3DPEHPK3PXP&issuer=Palladin',
      fields: [],
    })
    const entry = { ...KEY_ENTRY, type: ENTRY_TYPE_CREDENTIAL }

    render(<EntryRow vaultId="vault-1" entry={entry} />)
    fireEvent.click(screen.getByRole('button', { name: /^reveal$/i }))

    await waitFor(() => expect(openCurrentEntryMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a corruption error when reveal cannot open cached ciphertext', async () => {
    openCurrentEntryMock.mockRejectedValueOnce(new Error('invalid ciphertext'))
    const user = userEvent.setup()
    render(<EntryRow vaultId="vault-1" entry={KEY_ENTRY} />)

    await user.click(screen.getByRole('button', { name: /^reveal$/i }))

    expect(await screen.findByText(/could not decrypt entry/i)).toBeInTheDocument()
  })

  it('does not purge the generation for a selected structural-head mismatch', async () => {
    openCurrentEntryMock.mockRejectedValueOnce(structuralMismatch)
    const user = userEvent.setup()
    render(<EntryRow vaultId="vault-1" entry={KEY_ENTRY} />)

    await user.click(screen.getByRole('button', { name: /^reveal$/i }))

    expect(await screen.findByText(/entry changed while it was opening/i)).toBeInTheDocument()
  })
})
