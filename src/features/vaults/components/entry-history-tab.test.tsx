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
vi.mock('../../../shared/crypto/entry-draft', () => ({ fromMemberSecret: (value: unknown) => value }))
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
  currentRevision: '2', memberIndexRevision: '2', agentDiscoveryRevision: null,
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
    notes: 'Old notes', fields: [{ id: 'field-1', label: 'Config', type: 'multiline', value: 'A=1\nB=2' }] },
  agentVisibilityPolicy: { discoverable: false, fields: { value: 'onGrantValue' as const } },
}
const currentSecret = { ...oldSecret, memberLabel: 'Current label', content: { type: 0 as const, value: 'current-secret' } }
const item = {
  revision: '1', memberSequence: '1', discoverySequence: null,
  changedAt: '2026-07-25T10:00:00Z', changedByType: 1 as const,
  changedById: '33332233-4455-4677-8899-aabbccddeeff', operation: 1 as const, keyVersion: 1,
  entryKey: {}, memberSecret: {},
}

describe('EntryHistoryTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
    mocks.history.mockReturnValue({ data: { pages: [{ items: [item] }] }, isPending: false, isError: false,
      hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn() })
    mocks.decryptHistory.mockReset()
      .mockResolvedValueOnce(oldSecret)
      .mockResolvedValueOnce(currentSecret)
    mocks.mutateAsync.mockResolvedValue({ currentRevision: '3' })
  })

  it('keeps ciphertext opaque until reveal and restores through a new current-head update', async () => {
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)
    expect(mocks.decryptHistory).not.toHaveBeenCalled()
    expect(screen.getByText(/Ada Admin/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /reveal/i }))
    expect(await screen.findByTestId('historical-entry-form')).toBeInTheDocument()
    expect(screen.getByLabelText('Label')).toHaveValue('Old label')
    expect(screen.getByLabelText('Entry Type')).toHaveValue('Key')
    expect(screen.getByLabelText('URL')).toHaveValue('https://old.example.com')
    expect(screen.getByLabelText('Notes')).toHaveValue('Old notes')
    expect(screen.getByText(/A=1/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /restore this version/i }))

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({
      detail,
      previous: currentSecret,
      draft: {
        memberLabel: 'Old label', agentLabel: 'Old agent', description: 'Old description',
        iconReference: 'builtin:key', color: '#EB4747', entryType: 0,
        content: { type: 0, value: 'old-secret', url: 'https://old.example.com',
          notes: 'Old notes', fields: [{ id: 'field-1', label: 'Config', type: 'multiline', value: 'A=1\nB=2' }] },
        policy: { discoverable: false, fields: { value: 'onGrantValue' } },
      },
    }))
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
    let finishDecrypt: ((value: typeof oldSecret) => void) | undefined
    mocks.decryptHistory.mockReset().mockImplementation(() => new Promise((resolve) => { finishDecrypt = resolve }))
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)

    await user.click(screen.getByRole('button', { name: /reveal/i }))
    act(() => useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) }))
    await act(async () => finishDecrypt?.(oldSecret))

    await waitFor(() => expect(screen.queryByDisplayValue('Old label')).not.toBeInTheDocument())
    expect(mocks.mutateAsync).not.toHaveBeenCalled()
  })
})
