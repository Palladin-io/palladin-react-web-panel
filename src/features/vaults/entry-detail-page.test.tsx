import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { EntryDetailPage } from './entry-detail-page'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, type Vault } from './types'
import type { CustomField } from './types'
import { toMemberSecret } from '../../shared/crypto/entry-draft'
import { listGrantableFields, projectCanonicalGrantPayloadV2 } from '@palladin/crypto'
import type { AgentFieldAccess } from '../../shared/crypto/entry-draft'
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
  openCurrentEntryMock,
  canonicalRefetchMock,
  retrySyncMock,
  repairIconMutateMock,
  repairIconScopeMock,
  structuralMismatch,
  state,
} = vi.hoisted(() => ({
  useVaultMock: vi.fn(),
  useEntryDetailMock: vi.fn(),
  updateMutateMock: vi.fn(),
  deleteMutateMock: vi.fn(),
  navigateMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  openCurrentEntryMock: vi.fn(),
  canonicalRefetchMock: vi.fn(),
  retrySyncMock: vi.fn(),
  repairIconMutateMock: vi.fn(),
  repairIconScopeMock: vi.fn(),
  structuralMismatch: new Error('structural head mismatch'),
  state: {
    updateIsPending: false,
    deleteIsPending: false,
    decryptResult: null as EntryPlaintextLite | null,
    decryptShouldThrow: false,
    policyFields: {} as Record<string, AgentFieldAccess>,
    decryptedIconReference: undefined as string | undefined,
    memberIndex: { memberLabel: 'Stripe API Key', entryType: 'key' as 'key' | 'credential' | 'creditCard', icon: null },
    memberEntryAvailable: true,
    repairIconCandidateCount: 0,
    wideScreen: false,
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
      fields?: CustomField[]
      totp?: string
    }
  | {
      type: 3
      cardholderName: string
      cardNumber: string
      expiryMonth: string
      expiryYear: string
    }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))
vi.mock('../../shared/hooks/use-wide-screen', () => ({ useWideScreen: () => state.wideScreen }))
vi.mock('./global-entries-page', () => ({ GlobalEntriesPanel: () => null }))

vi.mock('./use-vault', () => ({
  useVault: (id: string) => useVaultMock(id),
  vaultQueryKey: (id: string) => ['vaults', id] as const,
}))

vi.mock('./use-entries', () => ({
  useCanonicalEntryDetail: (vaultId: string, entryId: string, enabled: boolean) => ({
    ...useEntryDetailMock(vaultId, entryId, enabled),
    refetch: canonicalRefetchMock,
  }),
  entriesQueryKey: (vaultId: string) => ['vaults', vaultId, 'entries'] as const,
  entryDetailQueryKey: (vaultId: string, entryId: string) =>
    ['vaults', vaultId, 'entries', entryId] as const,
  canonicalEntryDetailQueryKey: (
    vaultId: string,
    entryId: string,
    cryptoSessionGeneration: number,
  ) => ['vaults', vaultId, 'entries', entryId, 'canonical', cryptoSessionGeneration] as const,
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

vi.mock('./use-repair-missing-website-icons', () => ({
  useRepairMissingWebsiteIcons: (vaultId: string, entryId?: string) => {
    repairIconScopeMock(vaultId, entryId)
    return {
      candidateCount: state.repairIconCandidateCount,
      isPending: false,
      mutate: repairIconMutateMock,
    }
  },
}))

// Crypto round-trip is exercised by entry-crypto.test.ts. Here we stub the
// helpers so the component test stays focused on form behaviour and does
// not depend on libsodium WASM warm-up.
vi.mock('./sync/current-member-entry-reader', () => ({
  openCurrentMemberEntrySecret: openCurrentEntryMock,
  isCurrentMemberEntryStructuralHeadMismatchError: (error: unknown) => error === structuralMismatch,
}))
openCurrentEntryMock.mockImplementation(async () => {
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
      agentVisibilityPolicy: { discoverable: true, fields: { agentLabel: 'discovery', ...state.policyFields } },
    }
})
vi.mock('../../shared/crypto/entry-draft', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/entry-draft')>(),
  fromMemberSecret: (value: unknown) => value,
}))

vi.mock('./sync/member-sync-store', () => ({
  useMemberSyncStore: Object.assign(
    (selector: (value: unknown) => unknown) => selector(memberSyncState()),
    { getState: () => memberSyncState() },
  ),
}))

function memberSyncState() {
  const record = (entryId: string) => ({
    entryId,
    state: 'active',
    updatedAt: '2026-04-25T12:00:00Z',
    currentRevision: '1',
    memberIndexRevision: '1',
    currentKeyVersion: 1,
    payload: state.memberIndex,
    corrupt: false,
  })
  return {
    status: 'ready',
    vaults: new Map([['vault-1', { entries: new Map(state.memberEntryAvailable ? [
      ['entry-1', record('entry-1')],
      ['entry-2', record('entry-2')],
      ['entry-3', record('entry-3')],
    ] : []) }]]),
    retry: retrySyncMock,
  }
}

vi.mock('../../shared/crypto/sodium', () => ({
  wipe: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, info: vi.fn() },
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
    userId: '11111111-1111-4111-8111-111111111111',
    privateKey: new Uint8Array(32),
    isVaultLocked: false,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EntryDetailPage — DetailsTab', () => {
  it('drops previous plaintext and reveal state before opening another global Entry', async () => {
    const user = userEvent.setup()
    state.wideScreen = true
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'previous-entry-secret' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })
    const view = render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" fromEntries />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText(/^value$/i)).toHaveValue('previous-entry-secret'))
    await user.click(screen.getByRole('button', { name: /^reveal$/i }))
    expect(screen.getByLabelText(/^value$/i)).not.toHaveClass('secret-mask')
    let rejectOpen!: (error: Error) => void
    openCurrentEntryMock.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOpen = reject }))
    view.rerender(<EntryDetailPage vaultId="vault-1" entryId="entry-2" fromEntries />)
    expect(screen.getByLabelText(/^value$/i)).toHaveValue('')
    expect(screen.queryByDisplayValue('previous-entry-secret')).not.toBeInTheDocument()
    await act(async () => rejectOpen(new Error('test decrypt failure')))
    expect(screen.queryByDisplayValue('previous-entry-secret')).not.toBeInTheDocument()
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'new-entry-secret' }
    view.rerender(<EntryDetailPage vaultId="vault-1" entryId="entry-3" fromEntries />)
    await waitFor(() => expect(screen.getByLabelText(/^value$/i)).toHaveValue('new-entry-secret'))
    expect(screen.getByLabelText(/^value$/i)).toHaveClass('secret-mask')
  })

  it('makes newly added TOTP grantable when saving an existing credential', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password' }
    state.memberIndex = { memberLabel: 'AWS fixture', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText(/^username$/i)).toHaveValue('alice'))
    await user.click(screen.getByRole('button', { name: /add 2fa/i }))
    await user.type(screen.getByLabelText(/otpauth|secret/i), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
    await user.click(screen.getByRole('button', { name: /apply totp/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalledTimes(1))
    const draft = updateMutateMock.mock.calls[0][0].draft
    const fieldId = `custom:${draft.content.fields[0].id}`
    expect(draft.policy.fields[fieldId]).toBe('onGrantDerived')
    const secret = toMemberSecret({ label: draft.memberLabel, agentLabel: draft.agentLabel,
      type: draft.entryType, payload: draft.content, policy: draft.policy })
    const fields = listGrantableFields(secret).map(({ id }) => id)
    expect(fields).toContain(fieldId)
    const payload = await projectCanonicalGrantPayloadV2(secret, fields)
    expect(payload.fields).toContainEqual(expect.objectContaining({ id: fieldId, kind: 'totp', mode: 'derived',
      value: expect.objectContaining({ source: 'totp', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' }) }))
    expect(secret.content.customFields[0]).toMatchObject({ id: fieldId, type: 'totp',
      value: { secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', algorithm: 'SHA1', digits: 6, period: 30 } })
  })

  it('requires an explicit owner toggle to re-enable existing restricted TOTP without changing its seed', async () => {
    const user = userEvent.setup()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const field: CustomField = { id, label: '2FA', type: 'totp', value: {
      secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30,
    } }
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password', fields: [field] }
    state.policyFields = { [`custom:${id}`]: 'never' }
    state.memberIndex = { memberLabel: 'AWS fixture', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    const toggle = await screen.findByRole('switch', { name: /allow granted agents to use 2fa/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalled())
    const draft = updateMutateMock.mock.calls[0][0].draft
    expect(draft.policy.fields[`custom:${id}`]).toBe('onGrantDerived')
    expect(draft.content.fields).toEqual([field])
  })

  it.each(['never', 'onGrantDerived'] as const)('preserves native TOTP identity and its %s restriction on ordinary edits', async (access) => {
    const user = userEvent.setup()
    const uri = 'otpauth://totp/fixture?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=SHA1&digits=6&period=30'
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password', totp: uri }
    state.policyFields = { totp: access }
    state.memberIndex = { memberLabel: 'AWS fixture', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    const toggle = await screen.findByRole('switch', { name: /allow granted agents to use 2fa/i })
    expect(toggle).toHaveAttribute('aria-checked', String(access === 'onGrantDerived'))
    await user.type(screen.getByLabelText(/^label$/i), ' renamed')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalled())
    const draft = updateMutateMock.mock.calls[0][0].draft
    expect(draft.content.totp).toBe(uri)
    expect(draft.content.fields ?? []).toHaveLength(0)
    expect(draft.policy.fields.totp).toBe(access)
    const secret = toMemberSecret({ label: draft.memberLabel, agentLabel: draft.agentLabel,
      type: draft.entryType, payload: draft.content, policy: draft.policy })
    expect(secret.agentFieldAccess['credential.totp']).toBe(access)
    expect(listGrantableFields(secret).some(({ id }) => id === 'credential.totp')).toBe(access === 'onGrantDerived')
  })

  it('preserves distinct native and custom TOTP identities when both exist', async () => {
    const user = userEvent.setup()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const uri = 'otpauth://totp/primary?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=SHA1&digits=6&period=30'
    const field: CustomField = { id, label: 'Additional 2FA', type: 'totp', value: {
      secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA256', digits: 8, period: 60,
    } }
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password',
      totp: uri, fields: [field] }
    state.policyFields = { totp: 'never', [`custom:${id}`]: 'onGrantDerived' }
    state.memberIndex = { memberLabel: 'AWS fixture', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    expect(await screen.findByRole('switch', { name: /allow granted agents to use 2fa/i }))
      .toHaveAttribute('aria-checked', 'false')
    await user.type(screen.getByLabelText(/^label$/i), ' renamed')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalled())
    const draft = updateMutateMock.mock.calls[0][0].draft
    expect(draft.content.totp).toBe(uri)
    expect(draft.content.fields).toEqual([field])
    expect(draft.policy.fields.totp).toBe('never')
    expect(draft.policy.fields[`custom:${id}`]).toBe('onGrantDerived')
  })

  it('preserves existing custom TOTP never on an unrelated edit', async () => {
    const user = userEvent.setup()
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const field: CustomField = { id, label: '2FA', type: 'totp', value: {
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', algorithm: 'SHA1', digits: 6, period: 30,
    } }
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password', fields: [field] }
    state.policyFields = { [`custom:${id}`]: 'never' }
    state.memberIndex = { memberLabel: 'AWS fixture', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    await screen.findByRole('switch', { name: /allow granted agents to use 2fa/i })
    await user.type(screen.getByLabelText(/^label$/i), ' renamed')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalled())
    const draft = updateMutateMock.mock.calls[0][0].draft
    expect(draft.policy.fields[`custom:${id}`]).toBe('never')
    expect(draft.content.fields).toEqual([field])
  })

  it('saves applied TOTP immediately and preserves it during a same-head sync refresh', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'test-password' }
    state.memberIndex = { memberLabel: 'GitHub', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    const { rerender } = render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText(/^username$/i)).toHaveValue('alice'))
    await user.click(screen.getByRole('button', { name: /add 2fa/i }))
    await user.type(screen.getByLabelText(/otpauth|secret/i), 'JBSWY3DPEHPK3PXP')
    await user.click(screen.getByRole('button', { name: /apply totp/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalledTimes(1))
    expect(updateMutateMock.mock.calls[0][0].draft.content.fields[0].value.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(screen.queryByRole('button', { name: /add 2fa/i })).not.toBeInTheDocument()

    await act(async () => rerender(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />))

    expect(screen.queryByRole('button', { name: /add 2fa/i })).not.toBeInTheDocument()
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(1)
  })

  it('does not save applied TOTP while the edited URL is invalid', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password' }
    state.memberIndex = { memberLabel: 'GitHub', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText(/^username$/i)).toHaveValue('alice'))
    await user.clear(screen.getByLabelText(/^url$/i))
    await user.type(screen.getByLabelText(/^url$/i), 'not-a-url')
    await user.click(screen.getByRole('button', { name: /add 2fa/i }))
    await user.type(screen.getByLabelText(/otpauth|secret/i), 'JBSWY3DPEHPK3PXP')
    await user.click(screen.getByRole('button', { name: /apply totp/i }))
    expect(updateMutateMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /add 2fa/i })).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText(/^url$/i))
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalledTimes(1))
    expect(updateMutateMock.mock.calls[0][0].draft.content.fields[0].value.secret).toBe('JBSWY3DPEHPK3PXP')
  })

  it('validates the newly applied TOTP against existing custom-field labels before saving', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = {
      type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'test-password',
      fields: [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', label: '2fa', type: 'text', value: 'fixture' }],
    }
    state.memberIndex = { memberLabel: 'GitHub', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText(/^username$/i)).toHaveValue('alice'))
    await user.click(screen.getByRole('button', { name: /add 2fa/i }))
    await user.type(screen.getByLabelText(/otpauth|secret/i), 'JBSWY3DPEHPK3PXP')
    await user.click(screen.getByRole('button', { name: /apply totp/i }))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(updateMutateMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^save changes$/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /add 2fa/i })).not.toBeInTheDocument()
  })

  it('keeps applied TOTP after a save failure and retries it with Save', async () => {
    updateMutateMock.mockImplementation((_input, options) => options.onError())
    const user = userEvent.setup()
    unlockedAuthStore()
    state.decryptResult = { type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'test-password' }
    state.memberIndex = { memberLabel: 'GitHub', entryType: 'credential', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })
    await waitFor(() => expect(screen.getByLabelText(/^username$/i)).toHaveValue('alice'))
    await user.click(screen.getByRole('button', { name: /add 2fa/i }))
    await user.type(screen.getByLabelText(/otpauth|secret/i), 'JBSWY3DPEHPK3PXP')
    await user.click(screen.getByRole('button', { name: /apply totp/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalledTimes(1))
    expect(updateMutateMock.mock.calls[0][0].draft.content.fields[0].value.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(screen.queryByRole('button', { name: /add 2fa/i })).not.toBeInTheDocument()

    expect(toastError).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^save changes$/i }))
    await waitFor(() => expect(updateMutateMock).toHaveBeenCalledTimes(2))
    expect(updateMutateMock.mock.calls[1][0].draft.content.fields[0].value.secret).toBe('JBSWY3DPEHPK3PXP')

    expect(screen.queryByRole('button', { name: /add 2fa/i })).not.toBeInTheDocument()
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(1)
  })

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
    openCurrentEntryMock.mockClear()
    canonicalRefetchMock.mockReset().mockResolvedValue({ data: KEY_ENTRY })
    retrySyncMock.mockReset()
    repairIconMutateMock.mockReset()
    repairIconScopeMock.mockReset()
    state.updateIsPending = false
    state.deleteIsPending = false
    state.decryptResult = null
    state.decryptShouldThrow = false
    state.policyFields = {}
    state.decryptedIconReference = undefined
    state.memberEntryAvailable = true
    state.repairIconCandidateCount = 0
    state.wideScreen = false
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

  it('renders an error state with retry when the local current head is missing', () => {
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    state.memberEntryAvailable = false
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: undefined,
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

  it('offers a single-Entry icon repair and blocks it while the form has unsaved edits', async () => {
    const user = userEvent.setup()
    unlockedAuthStore()
    useAuthStore.setState({ permissions: 8 })
    state.decryptResult = {
      type: ENTRY_TYPE_CREDENTIAL,
      username: 'user', password: 'fixture-password', url: 'https://www.reddit.com/login',
    }
    state.memberIndex = { memberLabel: 'Reddit', entryType: 'credential', icon: null }
    state.repairIconCandidateCount = 1
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: CREDENTIAL_ENTRY })
    render(<EntryDetailPage vaultId="vault-1" entryId="entry-2" />, { wrapper })

    const repairButton = await screen.findByRole('button', { name: /find website icon/i })
    await waitFor(() => expect(repairButton).toBeEnabled())
    await user.type(screen.getByLabelText(/^url$/i), '/changed')
    expect(repairButton).toBeDisabled()
    expect(repairIconMutateMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /discard/i }))
    await user.click(repairButton)
    expect(repairIconScopeMock).toHaveBeenCalledWith('vault-1', 'entry-2')
    expect(repairIconMutateMock).toHaveBeenCalledTimes(1)
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
    }
    state.memberIndex = { memberLabel: 'Company card', entryType: 'creditCard', icon: null }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: canonicalEntry('entry-3') })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-3" />, { wrapper })

    const month = await screen.findByLabelText(/expiry month/i)
    expect(screen.getByLabelText(/cardholder name/i)).toHaveAttribute('maxlength', '256')
    expect(screen.getByLabelText(/cvv \/ cvc/i)).toHaveValue('')
    expect(screen.queryByLabelText(/^pin/i)).not.toBeInTheDocument()
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
      await screen.findByText(/encrypted data is being refreshed/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/vault may be locked/i)).not.toBeInTheDocument()
  })

  it('retries a failed decrypt when sync republishes the same Entry head', async () => {
    unlockedAuthStore()
    state.decryptShouldThrow = true
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'repaired-test-secret' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })
    const { rerender } = render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })
    expect(await screen.findByText(/encrypted data is being refreshed/i)).toBeInTheDocument()
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(1)

    // A repair publishes another local generation without changing the head.
    // An unsuccessful refresh retries once, without a render-driven retry loop.
    await act(async () => rerender(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />))
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/encrypted data is being refreshed/i)).toBeInTheDocument()

    state.decryptShouldThrow = false
    state.policyFields = {}
    await act(async () => rerender(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />))
    await waitFor(() => expect(screen.queryByText(/encrypted data is being refreshed/i)).not.toBeInTheDocument())
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(3)
    expect(screen.getByLabelText(/^value$/i)).toHaveValue('repaired-test-secret')

    await act(async () => rerender(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />))
    expect(openCurrentEntryMock).toHaveBeenCalledTimes(3)
  })

  it('shows the locked message only when no in-memory Vault key session exists', async () => {
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    expect(await screen.findByText(/vault is locked/i)).toBeInTheDocument()
  })

  it('shows a non-corruption message when the selected structural head changed', async () => {
    unlockedAuthStore()
    openCurrentEntryMock.mockRejectedValueOnce(structuralMismatch)
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })

    expect(await screen.findByText(/entry changed while it was opening/i)).toBeInTheDocument()
  })

  it('ignores in-flight plaintext when navigation cancels the decrypt', async () => {
    unlockedAuthStore()
    let resolveDecrypt: ((value: unknown) => void) | undefined
    openCurrentEntryMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveDecrypt = resolve
    }))
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({ isPending: false, isError: false, data: KEY_ENTRY })

    const view = render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" />, { wrapper })
    await waitFor(() => expect(resolveDecrypt).toBeDefined())
    view.unmount()

    await act(async () => {
      resolveDecrypt?.({
        schemaVersion: 1,
        memberLabel: 'Stripe API Key',
        agentLabel: 'Stripe API Key',
        entryType: ENTRY_TYPE_KEY,
        content: { type: ENTRY_TYPE_KEY, value: 'sk_live_123' },
        agentVisibilityPolicy: { discoverable: true, fields: { agentLabel: 'discovery' } },
      })
      await Promise.resolve()
    })

  })

  it('reopens the local item across unlock sessions without a canonical detail request', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const renderEntry = () => render(
      <QueryClientProvider client={client}>
        <EntryDetailPage vaultId="vault-1" entryId="entry-1" />
      </QueryClientProvider>,
    )
    state.decryptResult = { type: ENTRY_TYPE_KEY, value: 'sk_live_123' }
    useVaultMock.mockReturnValue({ isPending: false, isError: false, data: VAULT })
    useEntryDetailMock.mockReturnValue({
      isPending: false,
      isError: false,
      data: KEY_ENTRY,
    })

    useAuthStore.getState().unlockVault(
      new Uint8Array([1]),
      new Uint8Array([2]),
    )
    const firstSession = renderEntry()
    await waitFor(() => expect(openCurrentEntryMock).toHaveBeenCalledTimes(1))
    firstSession.unmount()

    useAuthStore.getState().lockVault()
    useAuthStore.getState().unlockVault(
      new Uint8Array([3]),
      new Uint8Array([4]),
    )
    renderEntry()

    await waitFor(() => expect(openCurrentEntryMock).toHaveBeenCalledTimes(2))
    expect(useEntryDetailMock).toHaveBeenCalledWith('vault-1', 'entry-1', false)
    expect(canonicalRefetchMock).not.toHaveBeenCalled()
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

  it.each([false, true])('returns to the source list after deletion (global Entries: %s)', async (fromEntries) => {
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

    render(<EntryDetailPage vaultId="vault-1" entryId="entry-1" fromEntries={fromEntries} />, { wrapper })

    await user.click(screen.getByRole('button', { name: /^delete entry$/i }))
    // Confirm dialog has its own Delete Entry button.
    const confirmButtons = await screen.findAllByRole('button', {
      name: /^delete entry$/i,
    })
    // The second occurrence belongs to the confirm dialog.
    await user.click(confirmButtons[confirmButtons.length - 1])

    expect(deleteMutateMock).toHaveBeenCalledWith('entry-1', expect.any(Object))
    expect(toastSuccess).toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith(fromEntries
      ? { to: '/entries' }
      : { to: '/vaults/$vaultId', params: { vaultId: 'vault-1' } })
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
