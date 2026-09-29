import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GlobalEntriesPanel } from './global-entries-page'
import { EntryNavigationRow } from './components/entry-navigation-row'
import { EntryListHeader } from './components/entry-list-header'
import { useGlobalEntriesUi } from './global-entries-model'
import { useMemberSyncStore, type DecryptedMemberVault } from './sync/member-sync-store'
import { SELECTED_NAVIGATION_CARD_CLASSES } from '../../shared/lib/styles'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ params, search, children, ...props }: {
    params: { vaultId: string; entryId: string }
    search: { from?: string }
    children: ReactNode
  }) => <a {...props} href={`/vaults/${params.vaultId}/entries/${params.entryId}${search.from ? '?from=entries' : ''}`}>{children}</a>,
}))
vi.mock('./components/vault-presentation-icon', () => ({ VaultPresentationIcon: () => <span /> }))
vi.mock('./components/global-create-entry', () => ({ GlobalCreateEntry: () => null }))
vi.mock('../../shared/components/load-more-sentinel', () => ({ LoadMoreSentinel: () => null }))

beforeEach(() => {
  const vault: DecryptedMemberVault = {
    vaultId: 'work', metadata: { name: 'Work', description: null, icon: null, color: null, grantMode: 'granular' },
    structure: { isDefault: false, createdAt: '', updatedAt: '', memberCount: 1, entryCount: 2, activeGrantCount: 0 },
    entries: new Map(['Alpha', 'Beta'].map((label) => [label, {
      entryId: label, state: 'active', updatedAt: '', currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 1, corrupt: false,
      payload: { memberLabel: label, entryType: 0, description: null, icon: null, color: null, username: null, urlDomain: null, customIndex: [] },
    }])),
    appliedThroughSequence: '1', status: 'ready', failureKind: null,
  }
  useMemberSyncStore.setState({ status: 'ready', vaults: new Map([['work', vault]]) })
  useGlobalEntriesUi.setState({ query: '', scrollTop: 0, renderLimit: 100 })
})
afterEach(() => {
  useMemberSyncStore.setState({ status: 'idle', vaults: new Map() })
  useGlobalEntriesUi.setState({ query: '', scrollTop: 0, renderLimit: 100 })
})

it('keeps the total count under the heading when search narrows the list', () => {
  render(<GlobalEntriesPanel selectedEntryId="Alpha" selectedVaultId="work" />)
  expect(screen.getByText('2 entries')).toBeInTheDocument()
  expect(screen.getAllByRole('link')).toHaveLength(2)
  const selected = screen.getByRole('link', { name: /Alpha/ })
  expect(selected).toHaveAttribute('aria-current', 'page')
  for (const value of SELECTED_NAVIGATION_CARD_CLASSES.split(' ')) expect(selected).toHaveClass(value)
  expect(selected.className).not.toContain('ring-')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Beta' } })
  expect(screen.getAllByRole('link')).toHaveLength(1)
  expect(screen.getByText('2 entries')).toBeInTheDocument()
})

it('uses identical row styling for global and per-Vault navigation', () => {
  const props = { vaultId: 'work', entryId: 'Alpha', label: 'Alpha', type: 0 as const, icon: null, subtitle: 'Work', isSelected: true }
  const view = render(<EntryNavigationRow {...props} />)
  const perVaultClasses = screen.getByRole('link').className
  expect(screen.getByRole('link')).toHaveAttribute('href', '/vaults/work/entries/Alpha')
  view.rerender(<EntryNavigationRow {...props} fromEntries />)
  expect(screen.getByRole('link').className).toBe(perVaultClasses)
  expect(screen.getByRole('link')).toHaveAttribute('href', '/vaults/work/entries/Alpha?from=entries')
})

it('shares the title, count and Add action header', () => {
  const onAdd = vi.fn()
  render(<EntryListHeader title="Work" count={1} onAdd={onAdd} />)
  expect(screen.getByRole('heading', { name: 'Work' })).toBeInTheDocument()
  expect(screen.getByText('1 entry')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }))
  expect(onAdd).toHaveBeenCalledOnce()
})
