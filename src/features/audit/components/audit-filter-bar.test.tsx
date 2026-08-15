import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuditFilterBar, type AuditFilterState } from './audit-filter-bar'

const EMPTY: AuditFilterState = {
  search: '',
  eventType: [],
  agentId: [],
  userId: [],
  vaultId: [],
  from: '',
  to: '',
}

const agentOptions = [
  { value: 'agent-1', label: 'github-copilot' },
  { value: 'agent-2', label: 'deploy-bot' },
]

/** Open the collapsible panel, then open the named multi-select dropdown. */
function openDropdown(ariaLabel: string) {
  fireEvent.click(screen.getByLabelText('Filters'))
  fireEvent.click(screen.getByLabelText(ariaLabel))
}

describe('AuditFilterBar', () => {
  it('keeps the filter row collapsed (hidden) until the tune toggle is pressed', () => {
    render(<AuditFilterBar value={EMPTY} onChange={vi.fn()} agentOptions={agentOptions} />)

    const toggle = screen.getByLabelText('Filters')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // The panel stays mounted (for the expand/collapse animation) but is hidden.
    expect(screen.getByLabelText('Filter by event type')).not.toBeVisible()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Filter by event type')).toBeVisible()
  })

  it('reports search changes through onChange', () => {
    const onChange = vi.fn()
    render(<AuditFilterBar value={EMPTY} onChange={onChange} agentOptions={agentOptions} />)

    fireEvent.change(screen.getByPlaceholderText('Search logs…'), {
      target: { value: 'stripe' },
    })
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, search: 'stripe' })
  })

  it('toggles an event type as a multi-select (array) value', () => {
    const onChange = vi.fn()
    render(<AuditFilterBar value={EMPTY} onChange={onChange} agentOptions={agentOptions} />)

    openDropdown('Filter by event type')
    fireEvent.click(screen.getByRole('option', { name: 'Credential Accessed' }))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, eventType: ['credential.accessed'] })
  })

  it('adds a second agent without dropping the first (multi-select)', () => {
    const onChange = vi.fn()
    render(
      <AuditFilterBar
        value={{ ...EMPTY, agentId: ['agent-1'] }}
        onChange={onChange}
        agentOptions={agentOptions}
      />,
    )

    openDropdown('Filter by agent')
    fireEvent.click(screen.getByRole('option', { name: 'deploy-bot' }))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, agentId: ['agent-1', 'agent-2'] })
  })

  it('counts each active filter dimension and clears them all', () => {
    const onChange = vi.fn()
    const active: AuditFilterState = {
      ...EMPTY,
      eventType: ['grant.created', 'grant.revoked'],
      agentId: ['agent-1'],
    }
    render(<AuditFilterBar value={active} onChange={onChange} agentOptions={agentOptions} />)

    // Two dimensions active (event types + agents), regardless of how many values each.
    expect(screen.getByText('2')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Filters'))
    fireEvent.click(screen.getByText('Clear'))
    expect(onChange).toHaveBeenCalledWith({
      ...active,
      eventType: [],
      agentId: [],
      userId: [],
      vaultId: [],
      from: '',
      to: '',
    })
  })

  it('renders the vault filter only when vault options are supplied', () => {
    const { rerender } = render(
      <AuditFilterBar value={EMPTY} onChange={vi.fn()} agentOptions={agentOptions} />,
    )
    fireEvent.click(screen.getByLabelText('Filters'))
    expect(screen.queryByLabelText('Filter by vault')).not.toBeInTheDocument()

    rerender(
      <AuditFilterBar
        value={EMPTY}
        onChange={vi.fn()}
        agentOptions={agentOptions}
        vaultOptions={[{ value: 'v1', label: 'Production' }]}
      />,
    )
    expect(screen.getByLabelText('Filter by vault')).toBeInTheDocument()
  })

  it('hides the agent filter when the surrounding view is already agent-scoped', () => {
    render(<AuditFilterBar value={EMPTY} onChange={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Filters'))
    expect(screen.getByLabelText('Filter by event type')).toBeInTheDocument()
    expect(screen.queryByLabelText('Filter by agent')).not.toBeInTheDocument()
  })

  it('renders the user filter only when user options are supplied and reports a selection', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <AuditFilterBar value={EMPTY} onChange={onChange} agentOptions={agentOptions} />,
    )
    fireEvent.click(screen.getByLabelText('Filters'))
    expect(screen.queryByLabelText('Filter by user')).not.toBeInTheDocument()

    rerender(
      <AuditFilterBar
        value={EMPTY}
        onChange={onChange}
        agentOptions={agentOptions}
        userOptions={[{ value: 'user-1', label: 'Patryk' }]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Filter by user'))
    fireEvent.click(screen.getByRole('option', { name: 'Patryk' }))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY, userId: ['user-1'] })
  })
})
