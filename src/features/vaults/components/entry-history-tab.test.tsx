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
vi.mock('../../../shared/crypto/vault-v2-entry', () => ({
  decryptHistoricalMemberSecret: (...args: unknown[]) => mocks.decryptHistory(...args),
  decryptMemberSecret: (...args: unknown[]) => mocks.decryptCurrent(...args),
}))
vi.mock('../../../shared/crypto/vault-v2-member-sync', () => ({
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
  content: { type: 0 as const, value: 'old-secret' },
  agentVisibilityPolicy: { discoverable: false, fields: {} },
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
    mocks.decryptHistory.mockResolvedValue(oldSecret)
    mocks.decryptCurrent.mockResolvedValue(currentSecret)
    mocks.mutateAsync.mockResolvedValue({ currentRevision: '3' })
  })

  it('keeps ciphertext opaque until reveal and restores through a new current-head update', async () => {
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)
    expect(mocks.decryptHistory).not.toHaveBeenCalled()
    expect(screen.getByText(/33332233…ddeeff/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /reveal/i }))
    expect(await screen.findByText('Old label')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /restore this version/i }))

    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({
      detail,
      previous: currentSecret,
      draft: {
        memberLabel: 'Old label', agentLabel: 'Old agent', entryType: 0,
        content: { type: 0, value: 'old-secret' },
        policy: { discoverable: false, fields: {} },
      },
    }))
  })

  it('drops revealed plaintext immediately when the vault locks', async () => {
    const user = userEvent.setup()
    render(<EntryHistoryTab detail={detail as never} />)
    await user.click(screen.getByRole('button', { name: /reveal/i }))
    expect(await screen.findByText('Old label')).toBeInTheDocument()
    act(() => useAuthStore.setState({ privateKey: null }))
    await waitFor(() => expect(screen.queryByText('Old label')).not.toBeInTheDocument())
  })
})
