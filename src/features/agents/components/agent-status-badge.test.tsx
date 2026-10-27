import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AGENT_STATUS_ACTIVE, AGENT_STATUS_PENDING, AGENT_STATUS_DEACTIVATED, AGENT_STATUS_DEACTIVATING } from '../api/agents-api'
import { AgentStatusBadge } from './agent-status-badge'

describe('AgentStatusBadge', () => {
  it.each([
    [AGENT_STATUS_ACTIVE, 'Active'],
    [AGENT_STATUS_PENDING, 'Pending'],
    [AGENT_STATUS_DEACTIVATED, 'Deactivated'],
    [AGENT_STATUS_DEACTIVATING, 'Deactivating'],
  ])('keeps the %s status readable without relying on colour', (status, label) => {
    render(<AgentStatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
