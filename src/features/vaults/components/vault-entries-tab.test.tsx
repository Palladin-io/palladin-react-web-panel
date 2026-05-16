import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryListItem,
  type Vault,
} from '../types'
import { VaultEntriesTab } from './vault-entries-tab'

// EntryRow navigates via a real <Link>; render it as a plain anchor so
// the tab tests don't need a full router context. `params` is dropped so
// it doesn't leak onto the DOM node as an unknown attribute.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params: _params,
    children,
    ...rest
  }: {
    to: string
    params?: unknown
    children: ReactNode
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const useEntriesMock = vi.fn()

vi.mock('../use-entries', () => ({
  useEntries: (vaultId: string) => useEntriesMock(vaultId),
  useEntryDetail: () => ({ data: undefined, isPending: false }),
  entriesQueryKey: (vaultId: string) => ['vaults', vaultId, 'entries'],
  entryDetailQueryKey: (vaultId: string, entryId: string) => [
    'vaults',
    vaultId,
    'entries',
    entryId,
  ],
}))

vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))

// CreateEntryModal pulls in form-heavy children — stub so the entries
// tab tests stay focused on list/empty rendering.
vi.mock('./create-entry-modal', () => ({
  CreateEntryModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-entry-modal" /> : null,
}))

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
  entryCount: 0,
  activeGrantCount: 0,
  memberCount: 1,
  wrappedVK: 'AAAA',
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('VaultEntriesTab', () => {
  beforeEach(() => {
    useEntriesMock.mockReset()
  })

  it('renders the empty state CTA when the vault has no entries', () => {
    useEntriesMock.mockReturnValue({
      data: { items: [] },
      isPending: false,
      isError: false,
    })

    render(<VaultEntriesTab vault={VAULT} />, { wrapper })

    expect(screen.getByText(/no entries yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add your first entry/i }),
    ).toBeInTheDocument()
  })

  it('renders one row per entry with the right type label', () => {
    const items: EntryListItem[] = [
      {
        id: 'e1',
        label: 'Stripe API Key',
        type: ENTRY_TYPE_KEY,
        accessCount: 0,
        createdAt: '2026-04-25T12:00:00Z',
        updatedAt: '2026-04-25T12:00:00Z',
      },
      {
        id: 'e2',
        label: 'GitHub',
        type: ENTRY_TYPE_CREDENTIAL,
        urlDomain: 'github.com',
        accessCount: 0,
        createdAt: '2026-04-25T12:00:00Z',
        updatedAt: '2026-04-25T12:00:00Z',
      },
    ]
    useEntriesMock.mockReturnValue({
      data: { items },
      isPending: false,
      isError: false,
    })

    render(<VaultEntriesTab vault={VAULT} />, { wrapper })

    expect(screen.getByText('Stripe API Key')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('github.com')).toBeInTheDocument()
  })

  it('shows a loading skeleton while fetching', () => {
    useEntriesMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    })
    const { container } = render(<VaultEntriesTab vault={VAULT} />, { wrapper })
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('shows an error banner when the entries fetch fails', () => {
    useEntriesMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    })
    render(<VaultEntriesTab vault={VAULT} />, { wrapper })
    expect(screen.getByText(/could not load vault data/i)).toBeInTheDocument()
  })
})
