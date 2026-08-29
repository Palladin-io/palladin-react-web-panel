import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AGENT_STATUS_DEACTIVATING } from '../api/agents-api'
import { AgentStatusBadge } from './agent-status-badge'

describe('AgentStatusBadge', () => {
  it('uses palette tokens for the deactivating state', () => {
    const { container } = render(<AgentStatusBadge status={AGENT_STATUS_DEACTIVATING} />)

    const badge = container.firstElementChild
    expect(badge).not.toBeNull()
    if (!badge) return
    expect(badge.className).toContain('var(--cv-premium-rgb)')
    expect(badge.className).toContain('var(--cv-premium)')
    expect(badge.className).not.toContain('#')
    expect(badge.className).not.toContain('rgba(')
  })
})
