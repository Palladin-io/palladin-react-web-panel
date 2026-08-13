import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Agent } from '../api/agents-api'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_PENDING,
} from '../api/agents-api'
import { AgentDetail } from './agent-detail'

// Each mutation hook is mocked with a controllable `mutate` so the test
// can drive the success / error callbacks.
const approveMutate = vi.fn()
const deactivateMutate = vi.fn()
const reactivateMutate = vi.fn()

vi.mock('../use-approve-agent', () => ({
  useApproveAgent: () => ({ mutate: approveMutate, isPending: false }),
}))
vi.mock('../use-deactivate-agent', () => ({
  useDeactivateAgent: () => ({ mutate: deactivateMutate, isPending: false }),
}))
vi.mock('../use-reactivate-agent', () => ({
  useReactivateAgent: () => ({ mutate: reactivateMutate, isPending: false }),
}))
vi.mock('../use-update-agent', () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false }),
}))

const captureMock = vi.fn()
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: (...args: unknown[]) => captureMock(...args) },
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

const baseAgent: Agent = {
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
  description: 'CI deployment agent',
  lastIp: null,
  lastHostname: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('AgentDetail', () => {
  beforeEach(() => {
    approveMutate.mockReset()
    deactivateMutate.mockReset()
    reactivateMutate.mockReset()
    captureMock.mockReset()
    toastError.mockReset()
  })

  it('renders the agent name, description and public key', () => {
    render(<AgentDetail agent={baseAgent} />, { wrapper })
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('CI deployment agent')).toBeInTheDocument()
    expect(screen.getByText('pk7Yq2Lm•••aB3x')).toBeInTheDocument()
  })

  it('renders the app-composed audit panel without importing the Audit feature', () => {
    const renderLogs = vi.fn(() => <div>Canonical agent audit log</div>)
    render(<AgentDetail agent={baseAgent} renderLogs={renderLogs} />, { wrapper })

    fireEvent.click(screen.getByRole('tab', { name: 'Logs' }))

    expect(renderLogs).toHaveBeenCalledWith('agent-1')
    expect(screen.getByText('Canonical agent audit log')).toBeInTheDocument()
  })

  it('shows the approve zone for a pending agent', () => {
    render(<AgentDetail agent={{ ...baseAgent, status: AGENT_STATUS_PENDING }} />, {
      wrapper,
    })
    expect(
      screen.getByRole('button', { name: /approve agent/i }),
    ).toBeInTheDocument()
  })

  it('hides the edit button for a pending agent', () => {
    render(<AgentDetail agent={{ ...baseAgent, status: AGENT_STATUS_PENDING }} />, {
      wrapper,
    })
    expect(
      screen.queryByRole('button', { name: /^edit agent$/i }),
    ).not.toBeInTheDocument()
  })

  it('confirming approve passes the input object to the mutation', () => {
    approveMutate.mockImplementation((_vars, opts) => opts.onSuccess())
    render(<AgentDetail agent={{ ...baseAgent, status: AGENT_STATUS_PENDING }} />, {
      wrapper,
    })

    fireEvent.click(screen.getByRole('button', { name: /approve agent/i }))
    const dialog = screen.getByRole('dialog', { name: /approve agent/i })
    // Name is optional in the approve dialog (it's sent as `name.trim() ||
    // undefined`); we fill it here only to exercise the populated path.
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Test Bot' },
    })
    const confirm = within(dialog).getByRole('button', {
      name: /^approve agent$/i,
    })
    fireEvent.click(confirm)

    expect(approveMutate).toHaveBeenCalledWith(
      { agentId: 'agent-1', input: expect.any(Object) },
      expect.any(Object),
    )
    expect(captureMock).toHaveBeenCalledWith('agents', 'agent-approved')
  })

  it('shows the danger zone for an active agent', () => {
    render(<AgentDetail agent={baseAgent} />, { wrapper })
    expect(screen.getByText(/danger zone/i)).toBeInTheDocument()
  })

  it('confirming deactivate calls the mutation and fires analytics', () => {
    deactivateMutate.mockImplementation((_id, opts) => opts.onSuccess())
    render(<AgentDetail agent={baseAgent} />, { wrapper })

    fireEvent.click(screen.getByRole('button', { name: /deactivate agent/i }))
    // Dialog confirm button.
    const confirmButtons = screen.getAllByRole('button', {
      name: /deactivate agent/i,
    })
    fireEvent.click(confirmButtons[confirmButtons.length - 1])

    expect(deactivateMutate).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Object),
    )
    expect(captureMock).toHaveBeenCalledWith('agents', 'agent-deactivated')
  })

  it('shows an error toast when reactivation fails', () => {
    reactivateMutate.mockImplementation((_id, opts) => opts.onError())
    render(
      <AgentDetail agent={{ ...baseAgent, status: AGENT_STATUS_DEACTIVATED }} />,
      { wrapper },
    )

    fireEvent.click(screen.getByRole('button', { name: /reactivate agent/i }))
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/could not reactivate/i))
  })
})
