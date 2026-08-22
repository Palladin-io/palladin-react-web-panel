import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { useMemberSyncStore, type MemberIndexRecord } from '../sync/member-sync-store'
import type { Vault } from '../types'
import { useEntriesListUi } from '../use-entries-list-ui'
import { VaultEntriesTab } from './vault-entries-tab'

const restoreMutate = vi.hoisted(() => vi.fn())
const destroyMutate = vi.hoisted(() => vi.fn())
const fetchDeletedNextPage = vi.hoisted(() => vi.fn())
const recentlyDeletedState = vi.hoisted(() => ({
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))
vi.mock('../../../shared/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('./create-entry-modal', () => ({
  CreateEntryModal: ({ open }: { open: boolean }) => open ? <div data-testid="create-entry-modal" /> : null,
}))
vi.mock('./entry-row', () => ({
  EntryRow: ({ entry }: { entry: { label: string } }) => <div data-testid="active-entry">{entry.label}</div>,
}))
vi.mock('../use-restore-archived-entries', () => ({
  useRestoreArchivedEntries: () => ({ mutateAsync: restoreMutate, isPending: false }),
}))
vi.mock('../use-recently-deleted-entries', () => ({
  useRecentlyDeletedEntries: (_vaultId: string, enabled: boolean) => ({
    data: enabled ? { pages: [{ items: [{ id: 'entry-c', retentionExpiresAt: '2026-08-25T12:00:00Z' }] }] } : undefined,
    isLoading: false, isError: false, ...recentlyDeletedState,
    fetchNextPage: fetchDeletedNextPage, refetch: vi.fn(),
  }),
  useDestroyEntry: () => ({ mutateAsync: destroyMutate, isPending: false }),
}))
const VAULT: Vault = {
  id: '22222222-2222-4222-8222-222222222222',
  organizationId: 'org-1',
  name: 'Production',
  description: null,
  icon: null,
  color: null,
  grantMode: 2,
  createdAt: '2026-04-25T12:00:00Z',
  updatedAt: '2026-04-25T12:00:00Z',
  entryCount: 0,
  activeGrantCount: 0,
  memberCount: 1,
  wrappedVK: 'AAAA',
}

function record(
  entryId: string,
  label: string,
  state: MemberIndexRecord['state'] = 'active',
  overrides: Partial<MemberIndexRecord> = {},
): MemberIndexRecord {
  const entryType = label.toLowerCase().includes('key') ? 'key' : 'credential'
  return {
    entryId,
    state,
    currentRevision: '1',
    memberIndexRevision: '1',
    currentKeyVersion: 1,
    payload: {
      schema: 'palladin.member-index.v1', memberLabel: label, entryType,
      description: null, icon: null, color: null, username: null, urlDomain: null, customIndex: [],
    },
    corrupt: false,
    ...overrides,
  }
}

function publish(entries: MemberIndexRecord[]) {
  useMemberSyncStore.getState().publishVault({
    vaultId: VAULT.id,
    metadata: { name: 'Production' },
    structure: {
      isDefault: false,
      createdAt: VAULT.createdAt,
      updatedAt: VAULT.updatedAt,
      memberCount: 1,
      entryCount: entries.length,
      activeGrantCount: 0,
    },
    entries: new Map(entries.map((entry) => [entry.entryId, entry])),
    appliedThroughSequence: '1',
    status: 'ready',
    failureKind: null,
  })
  useMemberSyncStore.getState().complete()
}

beforeEach(() => {
  useMemberSyncStore.getState().clear()
  useEntriesListUi.setState({ search: {}, scrollTop: {}, lifecycleState: {} })
  restoreMutate.mockReset()
  destroyMutate.mockReset()
  fetchDeletedNextPage.mockReset()
  useAuthStore.setState({ permissions: 0 })
  Object.assign(recentlyDeletedState, {
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  })
  restoreMutate.mockResolvedValue({ restored: [], failed: [] })
  destroyMutate.mockResolvedValue(undefined)
})

describe('VaultEntriesTab', () => {
  it('bounds the mounted row window for large locally decrypted Vaults', () => {
    publish(Array.from({ length: 539 }, (_, index) =>
      record(`entry-${index}`, `Entry ${String(index).padStart(3, '0')}`)))
    render(<VaultEntriesTab vault={VAULT} />)
    expect(screen.getAllByTestId('active-entry')).toHaveLength(50)
  })

  it('renders active entries from the decrypted MemberIndex, not a list API', () => {
    publish([
      record('entry-1', 'Stripe API Key', 'active', {
        payload: {
          schema: 'palladin.member-index.v1', memberLabel: 'Stripe API Key', entryType: 'key',
          description: null, icon: null, color: null, username: 'payments', urlDomain: null, customIndex: [],
        },
      }),
    ])
    render(<VaultEntriesTab vault={VAULT} />)
    expect(screen.getByTestId('active-entry')).toHaveTextContent('Stripe API Key')
  })

  it('searches decrypted MemberIndex fields locally', async () => {
    const user = userEvent.setup()
    publish([
      record('entry-1', 'Stripe', 'active', {
        payload: {
          schema: 'palladin.member-index.v1', memberLabel: 'Stripe', entryType: 'key',
          description: null, icon: null, color: null, username: 'payments prod', urlDomain: null, customIndex: [],
        },
      }),
      record('entry-2', 'GitHub'),
    ])
    render(<VaultEntriesTab vault={VAULT} />)
    await user.type(screen.getByPlaceholderText('Search entries…'), 'payments')
    expect(screen.getByText('Stripe')).toBeInTheDocument()
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument()
  })

  it('navigates between Active, Archive and Recently Deleted local states', async () => {
    const user = userEvent.setup()
    publish([
      record('entry-a', 'Active item'),
      record('entry-b', 'Archived item', 'archived'),
      record('entry-c', 'Deleted item', 'deleted'),
    ])
    render(<VaultEntriesTab vault={VAULT} />)
    expect(screen.getByText('Active item')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /entry lifecycle/i }))
    await user.click(screen.getByRole('option', { name: /Archived \(1\)/ }))
    expect(screen.getByText('Archived item')).toBeInTheDocument()
    expect(screen.getByText(/history preserved/i)).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: /Recently Deleted \(1\)/ }))
    expect(screen.getByText('Deleted item')).toBeInTheDocument()
    expect(screen.getByText(/permanently deleted after/i)).toBeInTheDocument()
  })

  it('mounts the automatic pagination sentinel for additional deleted-entry pages', async () => {
    const user = userEvent.setup()
    recentlyDeletedState.hasNextPage = true
    publish([record('entry-c', 'Deleted item', 'deleted')])

    render(<VaultEntriesTab vault={VAULT} />)
    await user.click(screen.getByRole('button', { name: /entry lifecycle/i }))
    await user.click(screen.getByRole('option', { name: /Recently Deleted \(1\)/ }))

    expect(screen.getByRole('status', { name: 'Loading more…' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('requires explicit confirmation before permanently deleting an Entry', async () => {
    const user = userEvent.setup()
    publish([record('entry-c', 'Deleted item', 'deleted')])
    render(<VaultEntriesTab vault={VAULT} />)

    await user.click(screen.getByRole('button', { name: /entry lifecycle/i }))
    await user.click(screen.getByRole('option', { name: /Recently Deleted \(1\)/ }))
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(destroyMutate).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: /Permanently delete/ })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Delete permanently' })[1])
    expect(destroyMutate).toHaveBeenCalledWith('entry-c')
  })

  it('restores one or selected Archived Entries through the lifecycle mutation', async () => {
    const user = userEvent.setup()
    restoreMutate.mockImplementation(async (ids: string[]) => ({ restored: ids, failed: [] }))
    publish([record('entry-a', 'Archived A', 'archived'), record('entry-b', 'Archived B', 'archived')])
    render(<VaultEntriesTab vault={VAULT} />)
    await user.click(screen.getByRole('button', { name: /entry lifecycle/i }))
    await user.click(screen.getByRole('option', { name: /Archived \(2\)/ }))
    await user.click(screen.getAllByRole('button', { name: /^Restore$/ })[0])
    expect(restoreMutate).toHaveBeenCalledWith(['entry-a'])

    await user.click(screen.getByRole('checkbox', { name: /select all archived/i }))
    await user.click(screen.getByRole('button', { name: /Restore selected \(2\)/i }))
    expect(restoreMutate).toHaveBeenLastCalledWith(['entry-a', 'entry-b'])
  })

  it('isolates a corrupt entry while keeping healthy rows usable', () => {
    const corruptId = '33333333-3333-4333-8333-333333333333'
    publish([
      record('entry-1', 'Healthy'),
      record(corruptId, '', 'active', { payload: null, corrupt: true }),
    ])
    render(<VaultEntriesTab vault={VAULT} />)
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('33333333…333333')).toBeInTheDocument()
    expect(screen.getByText(/encrypted index unavailable/i)).toBeInTheDocument()
  })

  it('sorts the local projection without refetching content', async () => {
    const user = userEvent.setup()
    publish([record('entry-1', 'Alpha'), record('entry-2', 'Zulu')])
    render(<VaultEntriesTab vault={VAULT} />)

    expect(screen.getAllByTestId('active-entry').map((row) => row.textContent)).toEqual(['Alpha', 'Zulu'])
    await user.click(screen.getByRole('button', { name: 'Sort entries' }))
    await user.click(screen.getByRole('option', { name: 'Name Z–A' }))
    expect(screen.getAllByTestId('active-entry').map((row) => row.textContent)).toEqual(['Zulu', 'Alpha'])
  })

  it('ignores an account-wide error when the selected vault remains ready', () => {
    publish([record('entry-1', 'Verified')])
    useMemberSyncStore.setState({ status: 'error', error: 'member-sync-failed' })
    render(<VaultEntriesTab vault={VAULT} />)

    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.queryByText(/existing verified entries remain available/i)).not.toBeInTheDocument()
  })

  it('keeps verified rows visible when the selected vault refresh fails', () => {
    publish([record('entry-1', 'Verified')])
    const current = useMemberSyncStore.getState().vaults.get(VAULT.id)!
    useMemberSyncStore.setState({
      vaults: new Map([[VAULT.id, { ...current, status: 'error', failureKind: 'sync' }]]),
    })
    render(<VaultEntriesTab vault={VAULT} />)

    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText(/existing verified entries remain available/i)).toBeInTheDocument()
  })

  it('reconciles optimistic records and tombstones through the sync store', () => {
    const original = record('entry-1', 'Original')
    publish([original])
    render(<VaultEntriesTab vault={VAULT} />)

    act(() => {
      useMemberSyncStore.getState().reconcileEntry(VAULT.id, {
        ...original,
        currentRevision: '2',
        memberIndexRevision: '2',
        payload: { ...original.payload!, memberLabel: 'Optimistic' },
      })
    })
    expect(screen.getByText('Optimistic')).toBeInTheDocument()

    act(() => {
      useMemberSyncStore.getState().reconcileEntry(VAULT.id, { entryId: original.entryId, tombstone: true })
    })
    expect(screen.queryByText('Optimistic')).not.toBeInTheDocument()
  })
})
