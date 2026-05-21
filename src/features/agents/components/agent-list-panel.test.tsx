import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../api/agents-api'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_PENDING,
} from '../api/agents-api'
import { AgentListPanel } from './agent-list-panel'

// <Link> needs a router context we don't spin up here — stub it to a
// plain anchor so the panel can render in isolation.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

const agentsState: {
  data: Agent[] | undefined
  isPending: boolean
  isError: boolean
  refetch: () => void
} = {
  data: undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}

vi.mock('../use-agents', () => ({
  useAgents: () => agentsState,
}))

const approveMutate = vi.fn()
vi.mock('../use-approve-agent', () => ({
  useApproveAgent: () => ({ mutate: approveMutate, isPending: false }),
}))

const activeAgent: Agent = {
  agentId: 'agent-1',
  name: 'Deploy Bot',
  status: AGENT_STATUS_ACTIVE,
  type: null,
  iconKey: null,
  publicKeyPrefix: 'pk7Yq2Lm',
  publicKeySuffix: 'aB3x',
  publicKey: 'pk7Yq2Lm0000000000000000aB3x',
  createdAt: '2026-05-17T10:00:00Z',
  enrolledAt: '2026-05-17T11:00:00Z',
  enrolledByName: 'Alice',
  deactivatedAt: null,
  deactivatedByName: null,
  description: null,
}

const pendingAgent: Agent = {
  agentId: 'agent-2',
  name: 'Backup Worker',
  status: AGENT_STATUS_PENDING,
  type: null,
  iconKey: null,
  publicKeyPrefix: 'pkZ9k1Aa',
  publicKeySuffix: 'Z9k1',
  publicKey: 'pkZ9k1Aa0000000000000000Z9k1',
  createdAt: '2026-05-18T10:00:00Z',
  enrolledAt: null,
  enrolledByName: null,
  deactivatedAt: null,
  deactivatedByName: null,
  description: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('AgentListPanel', () => {
  beforeEach(() => {
    agentsState.data = undefined
    agentsState.isPending = false
    agentsState.isError = false
    approveMutate.mockReset()
  })

  it('renders the empty state when there are no agents', () => {
    agentsState.data = []
    render(<AgentListPanel />, { wrapper })
    expect(screen.getByText(/no agents yet/i)).toBeInTheDocument()
  })

  it('renders an agent card with its name and status badge', () => {
    agentsState.data = [activeAgent]
    render(<AgentListPanel />, { wrapper })
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText(/● active/i)).toBeInTheDocument()
  })

  it('shows pending badge and approve button for a pending agent', () => {
    agentsState.data = [pendingAgent]
    render(<AgentListPanel />, { wrapper })
    expect(screen.getByText(/● pending/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approve agent/i })).toBeInTheDocument()
  })

  it('renders an error state when the list fails to load', () => {
    agentsState.isError = true
    render(<AgentListPanel />, { wrapper })
    expect(screen.getByText(/could not load agents/i)).toBeInTheDocument()
  })

  it('shows the formatted public key for an agent row', () => {
    agentsState.data = [activeAgent]
    render(<AgentListPanel />, { wrapper })
    expect(screen.getByText('pk7Yq2Lm•••aB3x')).toBeInTheDocument()
  })

  it('opens the approve dialog from the inline approve button', () => {
    agentsState.data = [pendingAgent]
    render(<AgentListPanel />, { wrapper })

    const rowButtons = screen.getAllByRole('button', { name: /approve/i })
    fireEvent.click(rowButtons[0])

    expect(
      screen.getByRole('dialog', { name: /approve agent/i }),
    ).toBeInTheDocument()
  })
})
