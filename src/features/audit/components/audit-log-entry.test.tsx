import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditLogEntry } from './audit-log-entry'
import type { AuditLogItem } from '../api/audit-api'

// The sentence renders names in their own bold <span>s, so the text spans
// multiple elements — match against the whole <p>'s textContent.
const sentence = (re: RegExp) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && re.test(el.textContent ?? '')

function item(overrides: Partial<AuditLogItem>): AuditLogItem {
  return {
    id: 'log-1',
    eventType: 'credential.accessed',
    actorType: 'agent',
    agentId: 'agent-1',
    entryId: 'entry-1',
    entryLabel: 'Stripe API Key',
    metadata: {},
    createdAt: '2026-06-27T10:00:00Z',
    ...overrides,
  }
}

describe('AuditLogEntry', () => {
  it('renders a failed login as a danger audit event without naming the target as actor', () => {
    render(
      <AuditLogEntry
        item={item({
          eventType: 'auth.login-failed',
          actorType: 'system',
          agentId: null,
          entryId: null,
          userId: null,
          metadata: { factor: 'password', targetUserId: 'target-user-id' },
        })}
      />,
    )

    expect(screen.getByText('Failed login attempt')).toBeInTheDocument()
    expect(screen.getByText('Login Failed')).toBeInTheDocument()
    expect(screen.queryByText('target-user-id')).not.toBeInTheDocument()
  })

  it('renders the credential-accessed sentence with the resolved agent name', () => {
    render(
      <AuditLogEntry
        item={item({ metadata: { grantType: 'granular', method: 'get' } })}
        agentName="github-copilot"
        entryName="Stripe API Key"
      />,
    )
    expect(
      screen.getByText(sentence(/github-copilot accessed Stripe API Key/i)),
    ).toBeInTheDocument()
    // Type chip + metadata chips.
    expect(screen.getByText('Credential Accessed')).toBeInTheDocument()
    expect(screen.getByText('Granular')).toBeInTheDocument()
    expect(screen.getByText('get')).toBeInTheDocument()
  })

  it('falls back to the opaque agent id when no name resolves', () => {
    render(<AuditLogEntry item={item({})} />)
    expect(screen.getByText(sentence(/agent-1 accessed entry-1/i))).toBeInTheDocument()
  })

  it('ignores a server-denormalised agentName on the row', () => {
    render(<AuditLogEntry item={item({ agentName: 'deploy-bot' })} />)
    expect(screen.getByText(sentence(/agent-1 accessed/i))).toBeInTheDocument()
    expect(screen.queryByText('deploy-bot')).not.toBeInTheDocument()
  })

  it('can fail closed instead of rendering denormalized row names', () => {
    render(<AuditLogEntry item={item({ agentName: 'SERVER NAME' })} allowDenormalizedNames={false} />)
    expect(screen.getByText(sentence(/agent-1 accessed entry-1/i))).toBeInTheDocument()
    expect(screen.queryByText('SERVER NAME')).not.toBeInTheDocument()
  })

  it('renders an actor + object sentence for entry lifecycle events', () => {
    render(
      <AuditLogEntry
        item={item({
          eventType: 'entry.created',
          actorType: 'user',
          agentId: null,
          actorName: 'Patryk',
        })}
        actorName="Patryk"
        entryName="Stripe API Key"
      />,
    )
    // actor (human) + action + bold object (entry name).
    expect(
      screen.getByText(sentence(/Patryk created entry Stripe API Key/i)),
    ).toBeInTheDocument()
  })

  it('uses local Vault names and renders the API-key name from audit metadata', () => {
    const { rerender } = render(
      <AuditLogEntry
        item={item({
          eventType: 'vault.created',
          actorType: 'user',
          agentId: null,
          vaultId: 'vault-1',
          entryId: null,
          entryLabel: null,
          actorName: 'Patryk',
          metadata: { name: 'Production Keys' },
        })}
        actorName="Patryk"
        vaultName="Production Keys"
      />,
    )
    expect(
      screen.getByText(sentence(/Patryk created vault Production Keys/i)),
    ).toBeInTheDocument()

    rerender(
      <AuditLogEntry
        item={item({
          eventType: 'apikey.created',
          actorType: 'user',
          agentId: null,
          entryId: null,
          entryLabel: null,
          actorName: 'Patryk',
          metadata: { keyName: 'CI Token' },
        })}
        actorName="Patryk"
      />,
    )
    expect(
      screen.getByText(sentence(/Patryk created API key CI Token/i)),
    ).toBeInTheDocument()
  })

  it('uses a localised "unnamed" object fallback (never an id) when no name resolves', () => {
    render(
      <AuditLogEntry
        item={item({
          eventType: 'vault.created',
          actorType: 'user',
          agentId: null,
          entryId: null,
          entryLabel: null,
          actorName: 'Patryk',
          metadata: {},
        })}
        actorName="Patryk"
      />,
    )
    expect(
      screen.getByText(sentence(/Patryk created vault \(unnamed\)/i)),
    ).toBeInTheDocument()
  })

  it('resolves the actor by actorType — a user-blocked agent is never its own blocker', () => {
    // agent.blocked: actor = human (user), agent = the blocked agent (object).
    // With actorName null, the actor must fall back to "Unknown user", NOT to
    // the agent name (which would read "Claude blocked agent Claude").
    render(
      <AuditLogEntry
        item={item({
          eventType: 'agent.blocked',
          actorType: 'user',
          actorName: null,
          agentId: 'agent-1',
          agentName: 'Claude',
        })}
        actorName="Unknown user"
        agentName="Claude"
      />,
    )
    expect(
      screen.getByText(sentence(/^Unknown user blocked agent Claude$/i)),
    ).toBeInTheDocument()
  })

  it('uses the agent name as actor for agent-initiated events', () => {
    render(
      <AuditLogEntry
        item={item({ eventType: 'agent.enrolled', actorType: 'agent', agentName: 'deploy-bot' })}
        agentName="deploy-bot"
      />,
    )
    expect(
      screen.getByText(sentence(/deploy-bot enrolled in the system/i)),
    ).toBeInTheDocument()
  })

  it('hides the entry chip when showEntry is false', () => {
    render(
      <AuditLogEntry
        item={item({})}
        agentName="copilot"
        entryName="Stripe API Key"
        showEntry={false}
      />,
    )
    // The entry name still appears in the sentence (bold), but not duplicated as
    // a standalone chip — so it occurs exactly once.
    expect(screen.getAllByText('Stripe API Key')).toHaveLength(1)
  })

  it('renders a neutral fallback for an unknown event type', () => {
    render(
      <AuditLogEntry item={item({ eventType: 'something.weird' })} agentName="x" />,
    )
    // Unknown events degrade to a neutral "Event" label (sentence + type chip).
    expect(screen.getAllByText('Event').length).toBeGreaterThan(0)
  })

  it('shows a vault chip when showVault and a vault name are provided', () => {
    render(
      <AuditLogEntry
        item={item({ vaultId: 'vault-1' })}
        agentName="copilot"
        showVault
        vaultName="Production Keys"
      />,
    )
    expect(screen.getByText('Production Keys')).toBeInTheDocument()
  })

  it('omits the vault chip by default (per-vault / entry views)', () => {
    render(
      <AuditLogEntry
        item={item({ vaultId: 'vault-1' })}
        agentName="copilot"
        vaultName="Production Keys"
      />,
    )
    expect(screen.queryByText('Production Keys')).not.toBeInTheDocument()
  })

  it('omits the vault chip when the name is unknown even with showVault', () => {
    render(<AuditLogEntry item={item({ vaultId: 'vault-1' })} agentName="copilot" showVault />)
    expect(screen.queryByText('vault-1')).not.toBeInTheDocument()
  })
})
