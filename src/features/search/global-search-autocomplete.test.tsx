import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalSearchAutocomplete } from './global-search-autocomplete'
import type { SearchResultItem } from './search-api'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const captureMock = vi.fn()
vi.mock('../../shared/lib/analytics', () => ({
  analytics: { capture: (...args: unknown[]) => captureMock(...args) },
}))

// Mutable return of the mocked query hook — each test sets what it needs.
const searchState = vi.hoisted(() => ({
  data: undefined as SearchResultItem[] | undefined,
  isFetching: false,
}))
vi.mock('./use-global-search', () => ({
  useGlobalSearch: () => searchState,
}))

const agentResult: SearchResultItem = { type: 'agent', id: 'a1', name: 'Deploy Bot' }
const entryResult: SearchResultItem = { type: 'entry', id: 'e1', name: 'GitHub', vaultName: 'Personal' }

function typeQuery(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
}

describe('GlobalSearchAutocomplete', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    captureMock.mockReset()
    searchState.data = undefined
    searchState.isFetching = false
  })

  it('renders the search bar and no dropdown by default', () => {
    render(<GlobalSearchAutocomplete placeholder="Search…" />)
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows the dropdown with typed results once the query is long enough', () => {
    searchState.data = [agentResult, entryResult]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)

    typeQuery('git')

    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    // entry hit carries its vault name subtitle
    expect(screen.getByText('Personal')).toBeInTheDocument()
  })

  it('navigates and fires analytics on ArrowDown + Enter', () => {
    searchState.data = [agentResult]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)

    const input = screen.getByRole('textbox')
    typeQuery('dep')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(navigateMock).toHaveBeenCalledWith({
      to: '/agents/$agentId',
      params: { agentId: 'a1' },
    })
    expect(captureMock).toHaveBeenCalledWith('search', 'search-result-selected', {
      type: 'agent',
      id: 'a1',
    })
  })

  it('closes the dropdown on Escape', () => {
    searchState.data = [agentResult]
    render(<GlobalSearchAutocomplete placeholder="Search…" />)

    const input = screen.getByRole('textbox')
    typeQuery('dep')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows "No results" when the result list is empty', () => {
    searchState.data = []
    render(<GlobalSearchAutocomplete placeholder="Search…" />)

    typeQuery('zzz')

    expect(screen.getByText('No results')).toBeInTheDocument()
  })
})
