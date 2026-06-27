import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../../agents'
import { AGENT_STATUS_ACTIVE } from '../../agents'
import { ApiKeyAgentsTab } from './api-key-agents-tab'

// <Link> needs a router context we don't spin up here — stub it to a
// plain anchor so the card can render in isolation.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

const queryState = vi.hoisted(() => ({
  value: {
    data: undefined as { pages: { items: Agent[] }[] } | undefined,
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}))

vi.mock('../use-api-key-agents', () => ({
  useApiKeyAgents: () => queryState.value,
}))

const agent: Agent = {
  agentId: 'agent-1',
  name: 'Deploy Bot',
  status: AGENT_STATUS_ACTIVE,
  type: null,
  iconKey: null,
  iconColor: null,
  publicKeyPrefix: 'pk7Yq2Lm',
  publicKeySuffix: 'aB3x',
  createdAt: '2026-05-17T10:00:00Z',
  enrolledAt: '2026-05-17T11:00:00Z',
  enrolledByName: 'Alice',
  deactivatedAt: null,
  deactivatedByName: null,
  reactivatedAt: null,
  reactivatedByName: null,
  description: null,
  lastIp: null,
  lastHostname: null,
}

describe('ApiKeyAgentsTab', () => {
  beforeEach(() => {
    queryState.value = {
      data: undefined,
      isPending: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    }
  })

  it('renders the empty state when no agents have used the key', () => {
    queryState.value.data = { pages: [{ items: [] }] }
    render(<ApiKeyAgentsTab apiKeyId="key-1" />)
    expect(screen.getByText(/no agents have used this key yet/i)).toBeInTheDocument()
  })

  it('renders an agent card for each returned agent', () => {
    queryState.value.data = { pages: [{ items: [agent] }] }
    render(<ApiKeyAgentsTab apiKeyId="key-1" />)
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
  })

  it('shows a load-more button and fetches the next page when there is one', async () => {
    const user = userEvent.setup()
    queryState.value.data = { pages: [{ items: [agent] }] }
    queryState.value.hasNextPage = true
    render(<ApiKeyAgentsTab apiKeyId="key-1" />)

    await user.click(screen.getByRole('button', { name: /load more/i }))
    expect(queryState.value.fetchNextPage).toHaveBeenCalled()
  })

  it('renders an error state when the list fails to load', () => {
    queryState.value.isError = true
    render(<ApiKeyAgentsTab apiKeyId="key-1" />)
    expect(screen.getByText(/could not load agents for this key/i)).toBeInTheDocument()
  })
})
