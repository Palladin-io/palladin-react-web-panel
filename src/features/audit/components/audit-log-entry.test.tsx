import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditLogEntry } from './audit-log-entry'
import type { AuditLogItem } from '../api/audit-api'

function item(overrides: Partial<AuditLogItem>): AuditLogItem {
  return {
    id: 'log-1',
    eventType: 'credential.accessed',
    actorType: 'agent',
    agentId: 'agent-1',
    entryId: 'entry-1',
    entryLabel: 'Stripe API Key',
    agentReason: null,
    metadata: {},
    createdAt: '2026-06-27T10:00:00Z',
    ...overrides,
  }
}

describe('AuditLogEntry', () => {
  it('renders the credential-accessed sentence with the resolved agent name', () => {
    render(
      <AuditLogEntry
        item={item({ metadata: { grantType: 'granular', method: 'get' } })}
        agentName="github-copilot"
      />,
    )
    expect(
      screen.getByText(/github-copilot accessed Stripe API Key/i),
    ).toBeInTheDocument()
    // Type chip + metadata chips.
    expect(screen.getByText('Credential Accessed')).toBeInTheDocument()
    expect(screen.getByText('Granular')).toBeInTheDocument()
    expect(screen.getByText('get')).toBeInTheDocument()
  })

  it('falls back to "Unknown agent" when no name resolves', () => {
    render(<AuditLogEntry item={item({})} />)
    expect(screen.getByText(/Unknown agent accessed/i)).toBeInTheDocument()
  })

  it('renders an entry-scoped sentence for entry lifecycle events', () => {
    render(
      <AuditLogEntry
        item={item({ eventType: 'entry.created', actorType: 'user', agentId: null })}
      />,
    )
    expect(screen.getByText(/Entry Stripe API Key created/i)).toBeInTheDocument()
  })

  it('hides the entry chip when showEntry is false', () => {
    render(
      <AuditLogEntry item={item({})} agentName="copilot" showEntry={false} />,
    )
    // The entry name still appears in the sentence, but not as a standalone chip.
    expect(screen.queryByText('Stripe API Key')).not.toBeInTheDocument()
  })

  it('renders a neutral fallback for an unknown event type', () => {
    render(
      <AuditLogEntry item={item({ eventType: 'something.weird' })} agentName="x" />,
    )
    // Unknown events degrade to a neutral "Event" label (sentence + type chip).
    expect(screen.getAllByText('Event').length).toBeGreaterThan(0)
  })
})
