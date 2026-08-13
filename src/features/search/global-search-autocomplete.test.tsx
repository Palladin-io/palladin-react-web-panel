import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalSearchAutocomplete } from './global-search-autocomplete'
import type { SearchResultItem } from './use-global-search'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const captureMock = vi.fn()
vi.mock('../../shared/lib/analytics', () => ({ analytics: { capture: (...args: unknown[]) => captureMock(...args) } }))

const searchState = vi.hoisted(() => ({
  data: [] as SearchResultItem[],
  local: [] as SearchResultItem[],
  isRemoteLoading: false,
  isRemoteError: false,
  isLocked: false,
  isSyncing: false,
}))
const recentState = vi.hoisted(() => ({ data: [] as SearchResultItem[] }))
vi.mock('./use-global-search', () => ({
  useGlobalSearch: () => searchState,
  useRecentLocalEntries: () => recentState.data,
}))

const agentResult: SearchResultItem = { type: 'agent', id: 'a1', name: 'Deploy Bot' }
const entryResult: SearchResultItem = {
  type: 'entry', id: 'e1', name: 'GitHub', vaultId: 'v9', vaultName: 'Personal',
  entryType: 'credential',
}

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  act(() => vi.advanceTimersByTime(250))
}

describe('GlobalSearchAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigateMock.mockReset()
    captureMock.mockReset()
    Object.assign(searchState, {
      data: [], local: [], isRemoteLoading: false, isRemoteError: false,
      isLocked: false, isSyncing: false,
    })
    recentState.data = []
  })

  afterEach(() => vi.useRealTimers())

  it('renders the search bar and no dropdown by default', () => {
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens and focuses search with Ctrl/Cmd+K', () => {
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('surfaces recent local entries when the empty field is focused', () => {
    recentState.data = [entryResult]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    fireEvent.focus(screen.getByRole('textbox'))
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
  })

  it('renders mixed local and administrative results', () => {
    searchState.data = [entryResult, agentResult, { type: 'member', id: 'm1', name: 'Ada' }]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    typeQuery('git')
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('renders the stored Vault glyph and Entry public asset', () => {
    const publicAsset =
      'public-asset:11111111-1111-4111-8111-111111111111|2|https%3A%2F%2Fassets.palladin.io%2Fgithub.png'
    searchState.data = [
      { type: 'vault', id: 'v1', name: 'Production', icon: 'database', color: '#10B981' },
      { ...entryResult, icon: publicAsset, color: '#60A5FA' },
    ]
    const { container } = render(<GlobalSearchAutocomplete placeholder="Search…" />)
    typeQuery('git')

    expect(container.querySelector('.mi')?.textContent).toBe('search')
    expect(Array.from(container.querySelectorAll('.mi')).some((icon) => icon.textContent === 'database')).toBe(true)
    expect(container.querySelector('img[src="https://assets.palladin.io/github.png"]')).toBeInTheDocument()
  })

  it('keeps local results visible while the administrative provider is loading or unavailable', () => {
    searchState.data = [entryResult]
    searchState.isRemoteLoading = true
    const view = render(<GlobalSearchAutocomplete placeholder="Search…" />)
    typeQuery('git')
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText(/searching members and agents/i)).toBeInTheDocument()

    searchState.isRemoteLoading = false
    searchState.isRemoteError = true
    view.rerender(<GlobalSearchAutocomplete placeholder="Search…" />)
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
  })

  it('navigates and emits only opaque result metadata on ArrowDown + Enter', () => {
    searchState.data = [agentResult]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    const input = screen.getByRole('textbox')
    typeQuery('dep')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigateMock).toHaveBeenCalledWith({ to: '/agents/$agentId', params: { agentId: 'a1' } })
    expect(captureMock).toHaveBeenCalledWith('search', 'search-result-selected', { type: 'agent', id: 'a1' })
    expect(captureMock).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ query: expect.anything() }))
  })

  it('uses the full Vault and Entry navigation scope', () => {
    searchState.data = [entryResult]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    typeQuery('git')
    fireEvent.click(screen.getByText('GitHub'))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/vaults/$vaultId/entries/$entryId', params: { vaultId: 'v9', entryId: 'e1' },
    })
  })

  it('shows an explicit locked state and supports Escape', () => {
    searchState.isLocked = true
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    const input = screen.getByRole('textbox')
    typeQuery('git')
    expect(screen.getByText(/unlock your vault/i)).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
