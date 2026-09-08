import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveAgentDialog } from './approve-agent-dialog'

vi.mock('../use-agent-types', () => ({
  useAgentTypes: () => ({ data: ['claudeCode', 'cursor', 'other'] }),
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

// Stub the icon picker — its file input + modal browser are exercised in
// their own suite; here we only care about the name / type / confirm flow.
vi.mock('./agent-icon-picker', () => ({
  AgentIconPicker: () => <div data-testid="agent-icon-picker" />,
  DEFAULT_AGENT_COLOR: '#10B981',
}))

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const baseProps = {
  open: true,
  agentId: 'agent-1',
  isPending: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('ApproveAgentDialog', () => {
  beforeEach(() => {
    toastError.mockReset()
    baseProps.onConfirm = vi.fn()
    baseProps.onCancel = vi.fn()
  })

  it('renders the dialog title and a name field', () => {
    render(<ApproveAgentDialog {...baseProps} />, { wrapper })
    expect(screen.getByRole('dialog', { name: /approve agent/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(<ApproveAgentDialog {...baseProps} open={false} />, { wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('confirming passes the trimmed name to onConfirm', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ApproveAgentDialog {...baseProps} onConfirm={onConfirm} initialName="" />,
      { wrapper },
    )

    await user.type(screen.getByLabelText(/^name$/i), '  Test Bot  ')
    await user.click(screen.getByRole('button', { name: /^approve agent$/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ name: 'Test Bot' })
  })

  it('cancelling invokes onCancel without confirming', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <ApproveAgentDialog {...baseProps} onCancel={onCancel} onConfirm={onConfirm} />,
      { wrapper },
    )

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows the Discovery provisioning phase after activation', () => {
    render(
      <ApproveAgentDialog {...baseProps} isPending isProvisioning />,
      { wrapper },
    )

    expect(screen.getByRole('button', { name: /configuring discovery/i })).toBeDisabled()
  })

  it('reports unsafe runtime metadata accessibly and disables confirmation', () => {
    render(
      <ApproveAgentDialog {...baseProps} initialType={'a'.repeat(101)} />,
      { wrapper },
    )

    const type = screen.getByRole('combobox', { name: /agent type/i })
    expect(type).toHaveAttribute('aria-invalid', 'true')
    expect(type).toHaveAccessibleDescription(/up to 100 visible characters/i)
    expect(screen.getByRole('button', { name: /^approve agent$/i })).toBeDisabled()
  })
})
