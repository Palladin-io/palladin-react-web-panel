import { describe, expect, it } from 'vitest'
import type { NotificationItem } from './notifications-api'
import { notificationCardPresentation } from './notification-presentation'

function makeItem(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: 'n',
    type: 'grant_pending',
    category: 'actionRequired',
    titleKey: 'notifications.grantPending.title',
    metadata: {},
    occurredAt: '2026-06-15T10:00:00Z',
    readAt: null,
    actionState: 'pending',
    ...overrides,
  }
}

describe('notificationCardPresentation', () => {
  it('builds a grant_pending card with agent avatar + entry/methods/reason rows', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'grant_pending',
        metadata: {
          agentName: 'Deploy Bot',
          entryLabel: 'GitHub Token',
          vaultName: 'Production',
          methods: 'get · inject',
          reason: 'deploy pipeline',
        },
      }),
    )

    expect(card.header.kind).toBe('agent')
    expect(card.name).toBe('Deploy Bot')
    expect(card.pill).toEqual({ labelKey: 'notifications.card.pill.pending', tone: 'amber' })
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowEntry',
      'notifications.card.rowMethods',
      'notifications.card.rowReason',
    ])
  })

  it('uses a red alert glyph + pill-less header for credential_stale', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'credential_stale',
        category: 'actionRequired',
        metadata: { agentName: 'Billing Bot', entryLabel: 'Stripe API' },
      }),
    )

    expect(card.header).toEqual({ kind: 'glyph', glyph: 'error', tone: 'red' })
    expect(card.name).toBe('Billing Bot')
  })

  it('gives every action-required card a "Pending" pill', () => {
    for (const type of ['agent_pending', 'grant_pending', 'credential_stale']) {
      const card = notificationCardPresentation(
        makeItem({ type, category: 'actionRequired' }),
      )
      expect(card.pill).toEqual({ labelKey: 'notifications.card.pill.pending', tone: 'amber' })
    }
  })

  it('attaches a status pill to history items', () => {
    expect(notificationCardPresentation(makeItem({ type: 'grant_approved' })).pill).toEqual({
      labelKey: 'notifications.card.pill.active',
      tone: 'green',
    })
    expect(notificationCardPresentation(makeItem({ type: 'grant_revoked' })).pill?.tone).toBe('red')
    expect(notificationCardPresentation(makeItem({ type: 'grant_denied' })).pill?.tone).toBe('amber')
  })

  it('models the entry row as a bold entry + vault suffix', () => {
    const card = notificationCardPresentation(
      makeItem({ metadata: { entryLabel: 'AWS Key', vaultName: 'Infra' } }),
    )
    expect(card.rows[0].value).toEqual({ kind: 'entry', entry: 'AWS Key', vault: 'Infra' })
  })

  it('falls back to a generic card for an unknown future type', () => {
    const card = notificationCardPresentation(
      makeItem({ type: 'something_new', titleKey: 'x.y' }),
    )
    expect(card.header).toEqual({ kind: 'glyph', glyph: 'notifications', tone: 'grey' })
    expect(card.rows).toHaveLength(0)
  })

  it('caps agent_pending at 3 rows: public key, agent id, host / ip (in order)', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_pending',
        category: 'actionRequired',
        metadata: {
          agentName: 'CI Runner',
          agentId: 'a-123',
          host: 'build-server-eu-west-1.internal',
          ip: '10.0.0.5',
          keyHint: 'pk_abc123',
        },
      }),
    )
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowPublicKey',
      'notifications.card.rowAgentId',
      'notifications.card.rowHostIp',
    ])
    // public key labelled "Public key", value rendered as-is
    expect(card.rows[0].value).toEqual({ kind: 'text', text: 'pk_abc123' })
    // host + ip merged into one row, host shortened with a middle ellipsis
    const hostIp = card.rows[2].value
    expect(hostIp.kind).toBe('text')
    if (hostIp.kind === 'text') {
      expect(hostIp.text).toContain('…')
      expect(hostIp.text).toContain('10.0.0.5')
      expect(hostIp.text).toContain(' / ')
    }
  })

  it('renders only the present agent rows (graceful degradation)', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_pending',
        category: 'actionRequired',
        metadata: { agentId: 'a-1', ip: '10.0.0.5' },
      }),
    )
    // no public key, no host → just agent id then the ip (in the host/ip row)
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowAgentId',
      'notifications.card.rowHostIp',
    ])
    const hostIp = card.rows[1].value
    expect(hostIp).toEqual({ kind: 'text', text: '10.0.0.5' })
  })

  it('renders agent_approved as an informational card with an active pill', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_approved',
        category: 'update',
        metadata: { agentName: 'CI Runner', agentId: 'a-9', actorName: 'Patryk R.' },
      }),
    )
    expect(card.header.kind).toBe('agent')
    expect(card.pill).toEqual({ labelKey: 'notifications.card.pill.active', tone: 'green' })
  })

  it('degrades agent_pending gracefully when metadata is empty', () => {
    const card = notificationCardPresentation(
      makeItem({ type: 'agent_pending', category: 'actionRequired', metadata: {} }),
    )
    expect(card.rows).toHaveLength(0)
    // No name → empty string + a fallback i18n key the card resolves to a
    // readable "Unknown agent" placeholder (never a blank header).
    expect(card.name).toBe('')
    expect(card.nameFallbackKey).toBe('grants.unknownAgent')
  })
})
