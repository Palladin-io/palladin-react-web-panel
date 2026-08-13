import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { EntryDetailPage } from './entry-detail-page'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, type Vault } from './types'
import type { CanonicalEntryDetail } from './api/vault-api'

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
  navigateMock,
  toastSuccess,
  toastError,
  state,
} = vi.hoisted(() => ({
  useVaultMock: vi.fn(),
  useEntryDetailMock: vi.fn(),
  updateMutateMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  navigateMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  state: {
    updateIsPending: false,
    deleteIsPending: false,
    decryptResult: null as EntryPlaintextLite | null,
    decryptShouldThrow: false,
    decryptedIconReference: undefined as string | undefined,
    memberIndex: { memberLabel: 'Stripe API Key', entryType: 'key' as 'key' | 'credential' | 'creditCard', icon: null },
  },
}))

// Avoids importing `EntryPlaintext` inside the hoisted block (hoisting
// must not depend on module imports).
type EntryPlaintextLite =
  | { type: 0; value: string; url?: string; notes?: string }
  | {
      type: 1
      username: string
      password: string
      url?: string
      notes?: string
    }
  | {
      type: 3
      cardholderName: string
      cardNumber: string
      expiryMonth: string
      expiryYear: string
      securityCode: string
    }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

vi.mock('./use-vault', () => ({
  useVault: (id: string) => useVaultMock(id),
  vaultQueryKey: (id: string) => ['vaults', id] as const,
}))

vi.mock('./use-entries', () => ({
  useCanonicalEntryDetail: (vaultId: string, entryId: string) =>
    useEntryDetailMock(vaultId, entryId),
  entriesQueryKey: (vaultId: string) => ['vaults', vaultId, 'entries'] as const,
  entryDetailQueryKey: (vaultId: string, entryId: string) =>
    ['vaults', vaultId, 'entries', entryId] as const,
}))

vi.mock('./use-update-canonical-entry', () => ({
  useUpdateCanonicalEntry: () => ({
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

// Crypto round-trip is exercised by entry-crypto.test.ts. Here we stub the
// helpers so the component test stays focused on form behaviour and does
// not depend on libsodium WASM warm-up.
vi.mock('../../shared/crypto/entry-protocol', () => ({
  openMemberSecret: vi.fn(async () => {
    if (state.decryptShouldThrow) throw new Error('mac')
    if (!state.decryptResult) {
      throw new Error('test setup: decryptResult not configured')
    }
    return {
      schemaVersion: 1,
      memberLabel: state.memberIndex.memberLabel,
      agentLabel: state.memberIndex.memberLabel,
      entryType: state.decryptResult.type,
      content: state.decryptResult,
      ...(state.decryptedIconReference ? { iconReference: state.decryptedIconReference } : {}),
      agentVisibilityPolicy: { discoverable: true, fields: { agentLabel: 'discovery' } },
    }
  }),
}))
vi.mock('../../shared/crypto/entry-draft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/entry-draft')>(),
  fromMemberSecret: (value: unknown) => value,
}))

vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: vi.fn(async () => new Uint8Array(32)),
}))
vi.mock('./sync/member-sync-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sync/member-sync-api')>()
  return {
    ...actual,
    getEncryptedVault: vi.fn(async () => ({
      memberVaultKey: {},
      currentKeyEpoch: { vaultKeyVersion: 1 },
      memberKeyGeneration: 1,
    })),
  }
})
vi.mock('./sync/member-sync-store', () => ({
  useMemberSyncStore: (selector: (value: unknown) => unknown) => selector({
    vaults: new Map([['vault-1', { entries: new Map([
      ['entry-1', { payload: state.memberIndex }],
      ['entry-2', { payload: state.memberIndex }],
      ['entry-3', { payload: state.memberIndex }],
    ]) }]]),
  }),
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
vi.mock('./components/entry-history-tab', () => ({
  EntryHistoryTab: () => <div data-testid="history-loaded">History loaded</div>,
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

const KEY_ENTRY = canonicalEntry('entry-1')

const CREDENTIAL_ENTRY = canonicalEntry('entry-2')

function canonicalEntry(id: string): CanonicalEntryDetail {
  const scope = { organizationId: '00000000-0000-4000-8000-000000000001', vaultId: '00000000-0000-4000-8000-000000000002', entryId: id }
  const header = { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 3, resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1, nonce: 'nonce' }
  return {
    organizationId: scope.organizationId,
    vaultId: scope.vaultId,
    id,
    state: 'active',
    currentRevision: '1',
    memberIndexRevision: '1',
    agentDiscoveryRevision: null,
    agentDiscoveryRevisionHighWatermark: '0',
    currentKeyVersion: 1,
    createdAt: '2026-04-25T12:00:00Z',
    createdBy: '00000000-0000-4000-8000-000000000003',
    updatedAt: '2026-04-25T12:00:00Z',
    updatedBy: '00000000-0000-4000-8000-000000000003',
    memberIndex: { ...scope, memberIndexRevision: '1', header: { ...header, projectionKind: 2 }, ciphertext: 'cipher' },
    memberSecret: { ...scope, revision: '1', operation: 1, header, ciphertext: 'cipher' },
    agentDiscovery: null,
    entryKey: { ...scope, wrapperRevision: '1', keyVersion: 1, memberKeyGeneration: 1, wrappingKeyVersion: 1,
      header: { ...header, projectionKind: 8 }, wrappedEntryDekByVk: 'wrapped' },
  }
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
  it('does not mount history until the History tab is selected', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })
    expect(screen.queryByTestId('history-loaded')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /history/i }))
    expect(screen.getByTestId('history-loaded')).toBeInTheDocument()
  })

  beforeEach(() => {
    useVaultMock.mockReset()
    useEntryDetailMock.mockReset()
    updateMutateMock.mockReset()
    deleteMutateMock.mockReset()
    navigateMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    state.updateIsPending = false
    state.deleteIsPending = false
    state.decryptResult = null
    state.decryptShouldThrow = false
    state.decryptedIconReference = undefined
    state.memberIndex = { memberLabel: 'Stripe API Key', entryType: 'key', icon: null }
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
    await waitFor(() =>
      expect(screen.getByLabelText(/^value$/i)).toHaveValue('sk_live_123'),
    )
    expect(screen.getByLabelText(/^label$/i)).toBeEnabled()
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
    state.memberIndex = { memberLabel: 'GitHub', entryType: 'credential', icon: null }
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

  it('keeps per-field CREDIT_CARD validation visible until each value is fixed', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = {
      type: ENTRY_TYPE_CREDIT_CARD,
      cardholderName: 'Ada Lovelace',
      cardNumber: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '2030',
      securityCode: '123',
    }
    state.memberIndex = { memberLabel: 'Company card', entryType: 'creditCard', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: canonicalEntry('entry-3') })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-3" />, { wrapper })

    const month = await screen.findByLabelText(/expiry month/i)
    expect(screen.getByLabelText(/cardholder name/i)).toHaveAttribute('maxlength', '256')
    await user.clear(month)
    await user.type(month, '13')
    await user.tab()
    const cardNumber = screen.getByLabelText(/card number/i)
    await user.clear(cardNumber)
    await user.type(cardNumber, '123')
    await user.tab()

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'Enter a 12–19 digit card number.',
      'Use a month from 01 to 12.',
    ])
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

  it('restores a KEY URL from encrypted content and preserves it on update', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_test', url: 'https://stripe.com' }
    state.decryptedIconReference = 'public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fstripe.png'
    state.memberIndex = {
      memberLabel: 'Stripe Key', entryType: 'key',
      icon: {
        kind: 'publicAsset',
        assetId: '11111111-1111-4111-8111-111111111111',
        revision: 1,
        url: 'https://assets.palladin.io/stripe.png',
      },
    }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    expect(await screen.findByLabelText(/^url$/i)).toHaveValue('https://stripe.com')
    const labelInput = screen.getByLabelText(/^label$/i)
    await user.clear(labelInput)
    await user.type(labelInput, 'Stripe production')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(updateMutateMock.mock.calls[0][0].draft).toMatchObject({
      iconReference: 'public-asset:11111111-1111-4111-8111-111111111111|1|https%3A%2F%2Fassets.palladin.io%2Fstripe.png',
      content: { type: ENTRY_TYPE_KEY, value: 'sk_test', url: 'https://stripe.com' },
    })
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
    expect(patch.draft.memberLabel).toBe('Renamed Key')
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
