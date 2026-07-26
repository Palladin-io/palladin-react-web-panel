import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMemberSyncStore, type MemberIndexRecord } from '../sync/member-sync-store'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, type Vault } from '../types'
import { useEntriesListUi } from '../use-entries-list-ui'
import { VaultEntriesTab } from './vault-entries-tab'

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
  return {
    entryId,
    state,
    currentRevision: '1',
    memberIndexRevision: '1',
    currentKeyVersion: 1,
    payload: { memberLabel: label, entryType: ENTRY_TYPE_CREDENTIAL, searchFields: [] },
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
})

describe('VaultEntriesTab', () => {
  it('renders active entries from the decrypted MemberIndex, not a list API', () => {
    publish([
      record('entry-1', 'Stripe API Key', 'active', {
        payload: { memberLabel: 'Stripe API Key', entryType: ENTRY_TYPE_KEY, searchFields: ['payments'] },
      }),
    ])
    render(<VaultEntriesTab vault={VAULT} />)
    expect(screen.getByTestId('active-entry')).toHaveTextContent('Stripe API Key')
  })

  it('searches decrypted MemberIndex fields locally', async () => {
    const user = userEvent.setup()
    publish([
      record('entry-1', 'Stripe', 'active', {
        payload: { memberLabel: 'Stripe', entryType: ENTRY_TYPE_KEY, searchFields: ['payments prod'] },
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

    await user.click(screen.getByRole('button', { name: /Archived \(1\)/ }))
    expect(screen.getByText('Archived item')).toBeInTheDocument()
    expect(screen.getByText(/history preserved/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Recently Deleted \(1\)/ }))
    expect(screen.getByText('Deleted item')).toBeInTheDocument()
    expect(screen.getByText(/recoverable during retention/i)).toBeInTheDocument()
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort entries' }), 'name-desc')
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
