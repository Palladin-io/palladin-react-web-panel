import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiKeySummary } from '../api/api-keys-api'
import { ApiKeyListPanel } from './api-key-list-panel'

// <Link> needs a router context we don't spin up here — stub it to a
// plain anchor so the panel can render in isolation.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

const keysState: {
  data: ApiKeySummary[] | undefined
  isPending: boolean
  isError: boolean
  refetch: () => void
} = {
  data: undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}

vi.mock('../use-api-keys', () => ({
  useApiKeys: () => keysState,
}))

// The generate modal owns its own mutation hook; stub it so this test
// stays focused on the list rendering.
vi.mock('./generate-api-key-modal', () => ({
  GenerateApiKeyModal: () => null,
}))

const activeKey: ApiKeySummary = {
  apiKeyId: 'key-1',
  name: 'CI pipeline',
  keySuffix: 'aB3x',
  status: 'active',
  createdAt: '2026-05-17T10:00:00Z',
  createdByName: 'Alice',
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('ApiKeyListPanel', () => {
  beforeEach(() => {
    keysState.data = undefined
    keysState.isPending = false
    keysState.isError = false
  })

  it('renders the empty state when there are no keys', () => {
    keysState.data = []
    render(<ApiKeyListPanel />, { wrapper })
    expect(screen.getByText(/no api keys yet/i)).toBeInTheDocument()
  })

  it('renders a key row with its name and status badge', () => {
    keysState.data = [activeKey]
    render(<ApiKeyListPanel />, { wrapper })
    expect(screen.getByText('CI pipeline')).toBeInTheDocument()
    expect(screen.getByText(/^active$/i)).toBeInTheDocument()
  })

  it('renders an error state when the list fails to load', () => {
    keysState.isError = true
    render(<ApiKeyListPanel />, { wrapper })
    expect(screen.getByText(/could not load api keys/i)).toBeInTheDocument()
  })
})
