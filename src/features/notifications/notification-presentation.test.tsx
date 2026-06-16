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
    expect(card.pill).toBeNull()
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

  it('shows agentId + host for agent_pending and never a keyHint row', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_pending',
        category: 'actionRequired',
        metadata: {
          agentName: 'CI Runner',
          agentId: 'a-123',
          host: 'build-eu-1',
          ip: '10.0.0.5',
          keyHint: 'pk_abc123',
        },
      }),
    )
    // agent id, host, IP, and the public key (labelled "Public key", not "key").
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowAgentId',
      'notifications.card.rowHost',
      'notifications.card.rowIp',
      'notifications.card.rowPublicKey',
    ])
    expect(card.rows[3].value).toEqual({ kind: 'text', text: 'pk_abc123' })
  })

  it('renders only the present agent rows (graceful degradation)', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_pending',
        category: 'actionRequired',
        metadata: { agentId: 'a-1', ip: '10.0.0.5' },
      }),
    )
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowAgentId',
      'notifications.card.rowIp',
    ])
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
    expect(card.name).toBe('—')
  })
})
