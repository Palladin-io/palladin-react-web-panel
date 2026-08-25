import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { EntryHistoryTab } from './entry-history-tab'

const mocks = vi.hoisted(() => ({
  decryptHistory: vi.fn(),
  decryptCurrent: vi.fn(),
  mutateAsync: vi.fn(),
  history: vi.fn(),
}))

vi.mock('../use-entries', () => ({ useEntryHistory: (...args: unknown[]) => mocks.history(...args) }))
vi.mock('../use-update-canonical-entry', () => ({
  useUpdateCanonicalEntry: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}))
vi.mock('../../../shared/crypto/entry-protocol', () => ({
  openMemberSecret: (...args: unknown[]) => mocks.decryptHistory(...args),
}))
vi.mock('../../../shared/crypto/entry-draft', () => ({
  fromMemberSecret: (value: { view?: unknown }) => value.view ?? value,
}))
vi.mock('../../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: vi.fn(async () => new Uint8Array(32).fill(7)),
}))
vi.mock('../sync/member-sync-api', () => ({
  getEncryptedVault: vi.fn(async () => ({
    memberVaultKey: { memberId: '00112233-4455-4677-8899-aabbccddeeff' },
    currentKeyEpoch: { vaultKeyVersion: 1 },
    memberKeyGeneration: 1,
  })),
}))
vi.mock('../../../shared/crypto/sodium', () => ({ wipe: vi.fn() }))
vi.mock('../../../shared/hooks/use-organization-member-directory', () => ({
  useOrganizationMemberDirectory: () => ({
    nameById: { '33332233-4455-4677-8899-aabbccddeeff': 'Ada Admin' },
  }),
}))

const detail = {
  organizationId: '00112233-4455-4677-8899-aabbccddeeff',
  vaultId: '11112233-4455-4677-8899-aabbccddeeff',
  id: '22222233-4455-4677-8899-aabbccddeeff',
  currentRevision: '3', memberIndexRevision: '3', agentDiscoveryRevision: null,
  agentDiscoveryRevisionHighWatermark: '1',
  currentKeyVersion: 2, state: 'active' as const,
  createdAt: '2026-07-25T10:00:00Z', updatedAt: '2026-07-26T10:00:00Z',
  createdBy: '00112233-4455-4677-8899-aabbccddeeff', updatedBy: '00112233-4455-4677-8899-aabbccddeeff',
  memberIndex: {}, memberSecret: {}, entryKey: {}, agentDiscovery: null,
}
const oldSecret = {
  schemaVersion: 1 as const, memberLabel: 'Old label', agentLabel: 'Old agent', entryType: 0 as const,
  description: 'Old description', iconReference: 'builtin:key', color: '#EB4747',
  content: { type: 0 as const, value: 'old-secret', url: 'https://old.example.com',
    notes: 'Old notes', fields: [
      { id: 'field-1', label: 'Config', type: 'multiline', value: 'A=1\nB=2' },
      { id: 'field-2', label: 'Future config', type: 'future-json', value: { region: 'eu', retries: 3 } },
    ] },
  agentVisibilityPolicy: { discoverable: false, fields: { value: 'onGrantValue' as const } },
}
const currentSecret = { ...oldSecret, memberLabel: 'Current label', content: { type: 0 as const, value: 'current-secret' } }
const previousSecret = { ...oldSecret, memberLabel: 'Previous label', content: {
  ...oldSecret.content, value: 'previous-secret',
} }
const oldCanonicalSecret = { marker: 'old-canonical', view: oldSecret }
const currentCanonicalSecret = { marker: 'current-canonical', view: currentSecret }
const previousCanonicalSecret = { marker: 'previous-canonical', view: previousSecret }
const item = {
  revision: '2', memberSequence: '2', discoverySequence: null,
  changedAt: '2026-07-25T10:00:00Z', changedByType: 1 as const,
  changedById: '33332233-4455-4677-8899-aabbccddeeff', operation: 2 as const, keyVersion: 1,
  entryKey: {}, memberSecret: {},
}
const previousItem = {
  ...item, revision: '1', memberSequence: '1', operation: 1 as const,
}

describe('EntryHistoryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3), cryptoSessionGeneration: 7 })
    mocks.history.mockReturnValue({ data: { pages: [{ items: [item] }] }, isPending: false, isError: false,
      hasNextPage: true, isFetchingNextPage: false,
      fetchNextPage: vi.fn().mockResolvedValue({ data: { pages: [{ items: [item] }, { items: [previousItem] }] } }),
      refetch: vi.fn() })
    mocks.decryptHistory.mockReset()
      .mockResolvedValueOnce(oldCanonicalSecret)
      .mockResolvedValueOnce(previousCanonicalSecret)
      .mockResolvedValueOnce(currentCanonicalSecret)
    mocks.mutateAsync.mockResolvedValue({ currentRevision: '3' })
  })

  it('keeps ciphertext opaque until reveal and restores through a new current-head update', async () => {
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)
    expect(mocks.decryptHistory).not.toHaveBeenCalled()
    expect(screen.getByText(/Ada Admin/)).toBeInTheDocument()
    const auditFooter = screen.getByTestId('entry-history-audit-footer')
    expect(auditFooter).toHaveTextContent(/Updated.*Ada Admin/i)
    expect(auditFooter).toHaveClass('min-h-[2.25rem]', 'py-1.5')
    expect(screen.getByRole('button', { name: /reveal/i })).toHaveClass('bg-[var(--cv-primary)]')

    await user.click(screen.getByRole('button', { name: /reveal/i }))
    const historicalForm = await screen.findByTestId('historical-entry-form')
    expect(historicalForm.parentElement).toHaveClass('entry-history-reveal')
    expect(historicalForm.parentElement).not.toHaveClass('bg-[var(--cv-bg-subtle)]')
    expect(screen.getByLabelText('Label')).toHaveValue('Old label')
    expect(screen.getByLabelText('Label')).toHaveAttribute('data-history-changed', 'true')
    expect(screen.getByLabelText('Agent-facing label')).not.toHaveAttribute('data-history-changed')
    expect(screen.getByLabelText('Entry Type')).toHaveValue('Key')
    expect(screen.getByLabelText('URL')).toHaveValue('https://old.example.com')
    expect(screen.getByLabelText('Notes')).toHaveValue('Old notes')
    expect(screen.getByText(/A=1/)).toBeInTheDocument()
    expect(screen.getByText('Future config')).toBeInTheDocument()
    expect(screen.queryByLabelText('Entry discovery')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /restore this version/i }))

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({
      detail,
      previous: currentSecret,
      draft: {
        memberLabel: 'Old label', agentLabel: 'Old agent', description: 'Old description',
        iconReference: 'builtin:key', color: '#EB4747', entryType: 0,
        content: { type: 0, value: 'old-secret', url: 'https://old.example.com',
          notes: 'Old notes', fields: [
            { id: 'field-1', label: 'Config', type: 'multiline', value: 'A=1\nB=2' },
            { id: 'field-2', label: 'Future config', type: 'future-json', value: { region: 'eu', retries: 3 } },
          ] },
        policy: { discoverable: false, fields: { value: 'onGrantValue' } },
      },
      cryptoSessionGeneration: 7,
      previousCanonicalMemberSecret: currentCanonicalSecret,
      nextCanonicalMemberSecret: oldCanonicalSecret,
    }))
  })

  it('renders the current revision as a compact status badge', () => {
    const currentItem = { ...item, revision: '3', memberSequence: '3' }
    mocks.history.mockReturnValue({ data: { pages: [{ items: [currentItem] }] }, isPending: false, isError: false,
      hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() })

    render(<EntryHistoryTab detail={detail as never} />)

    expect(screen.getByText(/^Current$/)).toHaveClass(
      'rounded-full',
      'bg-[rgb(var(--cv-success-rgb)/0.1)]',
      'text-micro',
    )
  })

  it('drops revealed plaintext immediately when the vault locks', async () => {
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)
    await user.click(screen.getByRole('button', { name: /reveal/i }))
    expect(await screen.findByDisplayValue('Old label')).toBeInTheDocument()
    act(() => useAuthStore.setState({ privateKey: null }))
    await waitFor(() => expect(screen.queryByDisplayValue('Old label')).not.toBeInTheDocument())
  })

  it('drops revealed plaintext when the unlock session is replaced', async () => {
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)
    await user.click(screen.getByRole('button', { name: /reveal/i }))
    expect(await screen.findByDisplayValue('Old label')).toBeInTheDocument()

    act(() => useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) }))

    await waitFor(() => expect(screen.queryByDisplayValue('Old label')).not.toBeInTheDocument())
  })

  it('does not publish plaintext decrypted by a replaced unlock session', async () => {
    let finishDecrypt: ((value: typeof oldCanonicalSecret) => void) | undefined
    mocks.decryptHistory.mockReset().mockImplementation(() => new Promise((resolve) => { finishDecrypt = resolve }))
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)

    await user.click(screen.getByRole('button', { name: /reveal/i }))
    act(() => useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) }))
    await act(async () => finishDecrypt?.(oldCanonicalSecret))

    await waitFor(() => expect(screen.queryByDisplayValue('Old label')).not.toBeInTheDocument())
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })
})
