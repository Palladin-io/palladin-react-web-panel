import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecentEntriesSection } from './recent-entries-section'

// Mutable state driving the module mocks below.
const state = vi.hoisted(() => ({
  recent: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}))
const entryIconMock = vi.hoisted(() => vi.fn(() => null))

vi.mock('../../grants', () => ({
  useRecentEntries: () => state.recent,
  formatRelativeTime: () => '2m ago',
}))

// The row reuses the vault icon presentation; stub with deterministic values so
// the test stays isolated from the real colour map.
vi.mock('../../vaults', () => ({
  ENTRY_TYPE_CREDENTIAL: 1,
  normalizeEntryType: (raw: unknown) =>
    raw === 'key' || raw === 0 ? 0 : 1,
  // Icon rendering is covered by entry-icon's own tests — capture its contract here.
  EntryIcon: entryIconMock,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}))

const entry = {
  id: 'e1',
  label: 'Production DB',
  vaultId: 'v1',
  vaultName: 'Work',
  type: 0,
  icon: 'public-asset:11111111-1111-4111-8111-111111111111|2|https%3A%2F%2Fassets.palladin.io%2Fgithub.png',
  color: '#60A5FA',
  updatedAt: '2026-06-29T10:00:00Z',
  createdAt: '2026-06-01T10:00:00Z',
}

describe('RecentEntriesSection', () => {
  beforeEach(() => {
    entryIconMock.mockClear()
    state.recent = { data: [], isPending: false, isError: false, refetch: vi.fn() }
  })

  it('renders local recents without an administrative search permission gate', () => {
    render(<RecentEntriesSection />)
    expect(screen.getByText('Recently added / modified')).toBeInTheDocument()
  })

  it('renders the entry rows with label, vault name and relative time', () => {
    state.recent = { ...state.recent, data: [entry] }
    render(<RecentEntriesSection />)
    expect(screen.getByText('Recently added / modified')).toBeInTheDocument()
    expect(screen.getByText('Production DB')).toBeInTheDocument()
    expect(screen.getByText(/Work · 2m ago/)).toBeInTheDocument()
    expect(entryIconMock).toHaveBeenCalledWith(
      expect.objectContaining({ icon: entry.icon, color: entry.color, type: 0 }),
      undefined,
    )
  })

  it('shows the empty state when there are no entries', () => {
    render(<RecentEntriesSection />)
    expect(
      screen.getByText(/the ones you add will show up here/i),
    ).toBeInTheDocument()
  })

  it('shows an error state with retry when the query fails', () => {
    state.recent = { ...state.recent, isError: true }
    render(<RecentEntriesSection />)
    expect(screen.getByText(/couldn't load recent entries/i)).toBeInTheDocument()
  })
})
