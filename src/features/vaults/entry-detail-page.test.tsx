import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { EntryDetailPage } from './entry-detail-page'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryContent,
  type EntryDetail,
  type Vault,
} from './types'

// ---------------------------------------------------------------------------
// Mocks
//
// All mock functions live in a `vi.hoisted` block so they can be referenced
// from the `vi.mock` factories below — vitest hoists the factories above
// every `const` declaration in the file, so anything they read must be
// hoisted alongside them.
// ---------------------------------------------------------------------------

const {
  useVaultMock,
  useEntryDetailMock,
  updateMutateMock,
  deleteMutateMock,
  iconUploadMock,
  navigateMock,
  toastSuccess,
  toastError,
  state,
} = vi.hoisted(() => ({
  useVaultMock: vi.fn(),
  useEntryDetailMock: vi.fn(),
  updateMutateMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  iconUploadMock: vi.fn(async () => true),
  navigateMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  state: {
    updateIsPending: false,
    deleteIsPending: false,
    iconIsUploading: false,
    decryptResult: null as EntryPlaintextLite | null,
    decryptShouldThrow: false,
  },
}))

// Avoids importing `EntryPlaintext` inside the hoisted block (hoisting
// must not depend on module imports).
type EntryPlaintextLite =
  | { type: 0; value: string; notes?: string }
  | {
      type: 1
      username: string
      password: string
      url?: string
      notes?: string
    }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('./use-vault', () => ({
  useVault: (id: string) => useVaultMock(id),
  vaultQueryKey: (id: string) => ['vaults', id] as const,
}))

vi.mock('./use-entries', () => ({
  useEntryDetail: (vaultId: string, entryId: string, enabled: boolean) =>
    useEntryDetailMock(vaultId, entryId, enabled),
  entriesQueryKey: (vaultId: string) => ['vaults', vaultId, 'entries'] as const,
  entryDetailQueryKey: (vaultId: string, entryId: string) =>
    ['vaults', vaultId, 'entries', entryId] as const,
}))

vi.mock('./use-update-entry', () => ({
  useUpdateEntry: () => ({
    mutate: updateMutateMock,
    get isPending() {
      return state.updateIsPending
    },
  }),
}))

vi.mock('./use-delete-entry', () => ({
  useDeleteEntry: () => ({
    mutate: deleteMutateMock,
    get isPending() {
      return state.deleteIsPending
    },
  }),
}))

vi.mock('./use-entry-icon-upload', () => ({
  useEntryIconUpload: () => ({
    upload: iconUploadMock,
    get isUploading() {
      return state.iconIsUploading
    },
    state: 'idle',
    error: null,
  }),
}))

// Crypto round-trip is exercised by entry-crypto.test.ts. Here we stub the
// helpers so the component test stays focused on form behaviour and does
// not depend on libsodium WASM warm-up.
const fakeVK = new Uint8Array(32)
vi.mock('../../shared/crypto/vault-key', () => ({
  unsealVaultKey: vi.fn(async () => fakeVK),
}))

vi.mock('../../shared/crypto/entry-crypto', () => ({
  decryptEntry: vi.fn(async () => {
    if (state.decryptShouldThrow) throw new Error('mac')
    if (!state.decryptResult) {
      throw new Error('test setup: decryptResult not configured')
    }
    return state.decryptResult
  }),
  encryptEntry: vi.fn(
    async (): Promise<EntryContent> => ({
      encryptedBlob: 'ENC',
      nonce: 'NCE',
    }),
  ),
}))

vi.mock('../../shared/crypto/sodium', () => ({
  wipe: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}))

// Heavy sub-components — focus the test on the form contract.
vi.mock('./components/entry-icon-picker', () => ({
  EntryIconPicker: () => <div data-testid="entry-icon-picker" />,
}))
vi.mock('./components/vault-detail-header', () => ({
  VaultDetailHeader: ({ title }: { title: string }) => (
    <header data-testid="vault-detail-header">{title}</header>
  ),
}))
vi.mock('./components/vault-entries-panel', () => ({
  VaultEntriesPanel: () => <div data-testid="vault-entries-panel" />,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VAULT: Vault = {
  id: 'vault-1',
  organizationId: 'org-1',
  name: 'Production',
  description: null,
  icon: null,
  color: null,
  grantMode: 2,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
  entryCount: 1,
  activeGrantCount: 0,
  memberCount: 1,
  wrappedVK: 'WRAPPED_VK_BASE64',
}

const KEY_ENTRY: EntryDetail = {
  id: 'entry-1',
  label: 'Stripe API Key',
  type: ENTRY_TYPE_KEY,
  accessCount: 0,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
  content: { encryptedBlob: 'CIPHER', nonce: 'NONCE' },
}

const CREDENTIAL_ENTRY: EntryDetail = {
  id: 'entry-2',
  label: 'GitHub',
  type: ENTRY_TYPE_CREDENTIAL,
  urlDomain: 'github.com',
  accessCount: 0,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
  content: { encryptedBlob: 'CIPHER', nonce: 'NONCE' },
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function unlockedAuthStore() {
  useAuthStore.setState({
    privateKey: new Uint8Array(32),
    isVaultLocked: false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntryDetailPage — DetailsTab', () => {
  beforeEach(() => {
    useVaultMock.mockReset()
    useEntryDetailMock.mockReset()
    updateMutateMock.mockReset()
    deleteMutateMock.mockReset()
    iconUploadMock.mockReset()
    iconUploadMock.mockResolvedValue(true)
    navigateMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    state.updateIsPending = false
    state.deleteIsPending = false
    state.iconIsUploading = false
    state.decryptResult = null
    state.decryptShouldThrow = false
    useAuthStore.setState({ privateKey: null, isVaultLocked: true })
    // Default to wide-screen off so the detail body renders without the
    // entries panel split — keeps assertions targeted.
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 800 })
    // jsdom does not implement matchMedia — useWideScreen needs it.
    if (typeof window.matchMedia !== 'function') {
      window.matchMedia = (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList
    }
  })

  it('renders a loading skeleton while vault or entry is pending', () => {
    useVaultMock.mockReturnValue({ isPending: true, isError: false, data: undefined })
    useEntryDetailMock.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    })

    const { container } = render(
      <EntryDetailPage vaultId="vault-1" entryId="entry-1" />,
      { wrapper },
    )

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders an error state with retry when the entry fetch fails', () => {
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    const refetch = vi.fn()
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
      refetch,
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    expect(screen.getByText(/could not load entry/i)).toBeInTheDocument()
  })

  it('renders the KEY form populated with server metadata and decrypted value', async () => {
    unlockedAuthStore()
    state.decryptResult = {
      type: ENTRY_TYPE_KEY,
      value: 'sk_live_123',
      notes: 'rotation due Q3',
    }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    expect(screen.getByLabelText(/^label$/i)).toHaveValue('Stripe API Key')
    // After decrypt the secret value and notes populate.
    await waitFor(() =>
      expect(screen.getByLabelText(/^value$/i)).toHaveValue('sk_live_123'),
    )
    expect(screen.getByLabelText(/^notes$/i)).toHaveValue('rotation due Q3')
  })

  it('renders CREDENTIAL username/password fields and not the KEY value field', async () => {
    unlockedAuthStore()
    state.decryptResult = {
      type: ENTRY_TYPE_CREDENTIAL,
      username: 'user@example.com',
      password: 'P@ssw0rd!',
      url: 'https://github.com/login',
    }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: CREDENTIAL_ENTRY,
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })

    await waitFor(() =>
      expect(screen.getByLabelText(/^username$/i)).toHaveValue('user@example.com'),
    )
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('P@ssw0rd!')
    expect(screen.queryByLabelText(/^value$/i)).not.toBeInTheDocument()
  })

  it('shows the decrypt error banner when unsealing/decrypting fails', async () => {
    unlockedAuthStore()
    state.decryptShouldThrow = true
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    expect(
      await screen.findByText(/could not decrypt entry/i),
    ).toBeInTheDocument()
  })

  it('keeps Save disabled until a field actually changes', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    const saveButton = await screen.findByRole('button', { name: /save changes/i })
    expect(saveButton).toBeDisabled()

    const labelInput = screen.getByLabelText(/^label$/i)
    await user.clear(labelInput)
    await user.type(labelInput, 'Renamed Key')

    expect(saveButton).not.toBeDisabled()
  })

  it('submits a trimmed label patch on Save and shows the success toast', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })
    updateMutateMock.mockImplementation((_patch, options) => {
      options.onSuccess()
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    await screen.findByLabelText(/^value$/i)

    const labelInput = screen.getByLabelText(/^label$/i)
    await user.clear(labelInput)
    await user.type(labelInput, '  Renamed Key  ')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock).toHaveBeenCalledTimes(1)
    const patch = updateMutateMock.mock.calls[0][0]
    expect(patch.label).toBe('Renamed Key')
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('shows an error toast when the update mutation fails', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })
    updateMutateMock.mockImplementation((_patch, options) => {
      options.onError(new Error('boom'))
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    await screen.findByLabelText(/^value$/i)

    const labelInput = screen.getByLabelText(/^label$/i)
    await user.clear(labelInput)
    await user.type(labelInput, 'Renamed')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
  })

  it('resets local edits to the server values when Discard is clicked', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    await screen.findByLabelText(/^value$/i)

    const labelInput = screen.getByLabelText(/^label$/i)
    await user.clear(labelInput)
    await user.type(labelInput, 'Renamed')
    expect(labelInput).toHaveValue('Renamed')

    await user.click(screen.getByRole('button', { name: /discard/i }))

    expect(labelInput).toHaveValue('Stripe API Key')
  })

  it('opens the delete dialog, confirms, and navigates away on success', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })
    deleteMutateMock.mockImplementation((_id, options) => {
      options.onSuccess()
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: /^delete entry$/i }))
    // Confirm dialog has its own Delete Entry button.
    const confirmButtons = await screen.findAllByRole('button', {
      name: /^delete entry$/i,
    })
    // The second occurrence belongs to the confirm dialog.
    await user.click(confirmButtons[confirmButtons.length - 1])

    expect(deleteMutateMock).toHaveBeenCalledWith('entry-1', expect.any(Object))
    expect(toastSuccess).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalled()
  })

  it('shows an error toast when the delete mutation fails', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })
    deleteMutateMock.mockImplementation((_id, options) => {
      options.onError(new Error('boom'))
    })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    await user.click(screen.getByRole('button', { name: /^delete entry$/i }))
    const confirmButtons = await screen.findAllByRole('button', {
      name: /^delete entry$/i,
    })
    await user.click(confirmButtons[confirmButtons.length - 1])

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
