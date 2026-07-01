import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_GRANT_MANAGE } from '../../../shared/lib/permissions'
import { RecentEntriesSection } from './recent-entries-section'

// Mutable state driving the module mocks below.
const state = vi.hoisted(() => ({
  permissions: 0,
  recent: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}))

vi.mock('../../auth', () => ({
  useAuthStore: (selector: (s: { permissions: number }) => unknown) =>
    selector({ permissions: state.permissions }),
}))

vi.mock('../../grants', () => ({
  useRecentEntries: () => state.recent,
  formatRelativeTime: () => '2m ago',
}))

// The row reuses the vault icon presentation; stub with deterministic values so
// the test stays isolated from the real colour map.
vi.mock('../../vaults', () => ({
  ENTRY_TYPE_CREDENTIAL: 1,
  ENTRY_ICON_COLORS: {} as Record<string, string>,
  isCustomIconUrl: () => false,
  presentationForType: () => ({
    defaultIcon: 'vpn_key',
    iconColor: '#10B981',
    iconBg: 'rgba(16,185,129,0.12)',
  }),
  hexWithAlpha: () => 'rgba(16,185,129,0.12)',
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
  icon: null,
  updatedAt: '2026-06-29T10:00:00Z',
  createdAt: '2026-06-01T10:00:00Z',
}

describe('RecentEntriesSection', () => {
  beforeEach(() => {
    state.permissions = PERMISSION_GRANT_MANAGE
    state.recent = { data: [], isPending: false, isError: false, refetch: vi.fn() }
  })

  it('renders nothing without the GrantManage permission', () => {
    state.permissions = 0
    const { container } = render(<RecentEntriesSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the entry rows with label, vault name and relative time', () => {
    state.recent = { ...state.recent, data: [entry] }
    render(<RecentEntriesSection />)
    expect(screen.getByText('Recently added / modified')).toBeInTheDocument()
    expect(screen.getByText('Production DB')).toBeInTheDocument()
    expect(screen.getByText(/Work · 2m ago/)).toBeInTheDocument()
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
