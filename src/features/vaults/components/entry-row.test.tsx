import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { EntryRow } from './entry-row'
import { ENTRY_TYPE_KEY, type EntryListItem } from '../types'

const { useEntryDetailMock, decryptEntryMock, writeTextMock } = vi.hoisted(() => ({
  useEntryDetailMock: vi.fn(),
  decryptEntryMock: vi.fn(),
  writeTextMock: vi.fn(async () => {}),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) =>
    <a {...props}>{children}</a>,
}))

vi.mock('../use-entries', () => ({
  useCanonicalEntryDetail: (vaultId: string, entryId: string, enabled: boolean) =>
    useEntryDetailMock(vaultId, entryId, enabled),
}))

vi.mock('../sync/member-sync-api', () => ({
  getEncryptedVault: vi.fn(async () => ({ memberVaultKey: {} })),
}))

vi.mock('../../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: vi.fn(async () => new Uint8Array(32)),
}))

vi.mock('../../../shared/crypto/entry-protocol', () => ({
  openMemberSecret: decryptEntryMock,
}))

vi.mock('../../../shared/crypto/entry-draft', () => ({
  fromMemberSecret: (secret: unknown) => ({ content: secret }),
}))

vi.mock('../../../shared/crypto/sodium', () => ({ wipe: vi.fn() }))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const KEY_ENTRY: EntryListItem = {
  id: 'entry-1',
  label: 'Stripe API Key',
  type: ENTRY_TYPE_KEY,
  accessCount: 0,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
}

describe('EntryRow — copy vs reveal', () => {
  beforeEach(() => {
    useEntryDetailMock.mockReset()
    decryptEntryMock.mockReset()
    writeTextMock.mockClear()
    // Detail (encrypted blob) is available once fetched; the row's own
    // `wantDetail` gate decides when to decrypt.
    useEntryDetailMock.mockReturnValue({
      data: {
        ...KEY_ENTRY, organizationId: 'org-1', currentRevision: '1',
        entryKey: {}, memberSecret: {},
      },
      isPending: false,
    })
    decryptEntryMock.mockResolvedValue({ type: ENTRY_TYPE_KEY, value: 'sk_live_secret' })
    useAuthStore.setState({ privateKey: new Uint8Array(32), isVaultLocked: false })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: writeTextMock } })
  })

  it('copies the secret WITHOUT opening the reveal panel', async () => {
    render(<EntryRow vaultId="vault-1" wrappedVK="WRAPPED" entry={KEY_ENTRY} />)

    // Reveal panel is closed: its Hide toggle must not be present yet.
    expect(screen.queryByRole('button', { name: /hide/i })).not.toBeInTheDocument()

    // fireEvent (not userEvent) so its clipboard stub doesn't shadow our mock.
    fireEvent.click(screen.getByRole('button', { name: /copy key/i }))

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('sk_live_secret'))
    // Copy must NOT expand the row — the reveal panel stays closed.
    expect(screen.queryByRole('button', { name: /hide/i })).not.toBeInTheDocument()
  })

  it('opens the reveal panel only when the reveal action is clicked', async () => {
    const user = userEvent.setup()
    render(<EntryRow vaultId="vault-1" wrappedVK="WRAPPED" entry={KEY_ENTRY} />)

    await user.click(screen.getByRole('button', { name: /^reveal$/i }))

    expect(await screen.findByRole('button', { name: /hide/i })).toBeInTheDocument()
  })
})
