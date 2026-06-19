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
          agentId: 'a-77',
          agentIconKey: 'smart_toy',
          entryLabel: 'GitHub Token',
          vaultName: 'Production',
          methods: 'get · inject',
          reason: 'deploy pipeline',
        },
      }),
    )

    expect(card.header.kind).toBe('agent')
    // Avatar gets the real agentId (deterministic colour) + iconKey, like the
    // Agents list.
    if (card.header.kind === 'agent') {
      expect(card.header.agentId).toBe('a-77')
      expect(card.header.agentIconKey).toBe('smart_toy')
    }
    // Title = type name; agent name moves to the subtitle.
    expect(card.titleKey).toBe('notifications.type.grantPending')
    expect(card.subtitleKey).toBe('notifications.sub.grantPending')
    expect(card.subtitleAgent).toBe('Deploy Bot')
    expect(card.pill).toEqual({ labelKey: 'notifications.card.pill.pending', tone: 'amber' })
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowEntry',
      'notifications.card.rowMethods',
      'notifications.card.rowReason',
    ])
  })

  it('uses a red alert glyph + type title for credential_stale', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'credential_stale',
        category: 'actionRequired',
        metadata: { agentName: 'Billing Bot', entryLabel: 'Stripe API' },
      }),
    )

    expect(card.header).toEqual({ kind: 'glyph', glyph: 'error', tone: 'red' })
    expect(card.titleKey).toBe('notifications.type.credentialStale')
    expect(card.subtitleAgent).toBe('Billing Bot')
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

  it('agent_pending: fixed rows public key · type · agent id · host·ip (in order)', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_pending',
        category: 'actionRequired',
        metadata: {
          agentName: 'CI Runner',
          agentId: 'a-123',
          agentType: 'ci',
          host: 'build-server-eu-west-1.internal',
          ip: '10.0.0.5',
          agentPublicKey: 'ABCDEFGHxxxxxxxxxxYYYYYY',
        },
      }),
    )
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowPublicKey',
      'notifications.card.rowType',
      'notifications.card.rowAgentId',
      'notifications.card.rowHostIp',
    ])
    // Full key shortened client-side per the Key & ID Display Standard (first 8 … last 6).
    expect(card.rows[0].value).toEqual({ kind: 'text', text: 'ABCDEFGH…YYYYYY' })
    expect(card.rows[1].value).toEqual({ kind: 'text', text: 'ci' })
    const hostIp = card.rows[3].value
    expect(hostIp.kind).toBe('text')
    if (hostIp.kind === 'text') {
      expect(hostIp.text).toContain('…')
      expect(hostIp.text).toContain('10.0.0.5')
      expect(hostIp.text).toContain(' · ')
    }
  })

  it('agent_pending always keeps the fixed rows, missing values → em-dash', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_pending',
        category: 'actionRequired',
        metadata: { agentId: 'a-1' },
      }),
    )
    // no public key/type/host/ip → still the fixed rows, placeholders for missing
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowPublicKey',
      'notifications.card.rowType',
      'notifications.card.rowAgentId',
      'notifications.card.rowHostIp',
    ])
    expect(card.rows[0].value).toEqual({ kind: 'text', text: '—' })
    expect(card.rows[1].value).toEqual({ kind: 'text', text: '—' })
    expect(card.rows[2].value).toEqual({ kind: 'text', text: 'a-1' })
    expect(card.rows[3].value).toEqual({ kind: 'text', text: '—' })
  })

  it('grant_pending always keeps 3 rows even when methods/reason are absent', () => {
    const card = notificationCardPresentation(
      makeItem({ type: 'grant_pending', metadata: { entryLabel: 'GitHub Token' } }),
    )
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowEntry',
      'notifications.card.rowMethods',
      'notifications.card.rowReason',
    ])
    expect(card.rows[1].value).toEqual({ kind: 'text', text: '—' })
    expect(card.rows[2].value).toEqual({ kind: 'text', text: '—' })
  })

  it('grant_approved shows immutable Entry · Methods · Reason · By (no mutable access counter)', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'grant_approved',
        category: 'update',
        metadata: {
          entryLabel: 'AWS Key',
          methods: 'get, inject',
          reason: 'CI deploy',
          actorName: 'Patryk R.',
        },
      }),
    )
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowEntry',
      'notifications.card.rowMethods',
      'notifications.card.rowReason',
      'notifications.card.rowBy',
    ])
    expect(card.rows[2].value).toEqual({ kind: 'text', text: 'CI deploy' })
    expect(card.rows[3].value).toEqual({ kind: 'text', text: 'Patryk R.' })

    // Reason falls back to em-dash when absent
    const noReason = notificationCardPresentation(
      makeItem({ type: 'grant_approved', category: 'update', metadata: { entryLabel: 'AWS Key' } }),
    )
    expect(noReason.rows[2].value).toEqual({ kind: 'text', text: '—' })
  })

  it('agent_approved shows the agent rows and NO "By" row', () => {
    const card = notificationCardPresentation(
      makeItem({
        type: 'agent_approved',
        category: 'update',
        metadata: { agentName: 'CI Runner', agentId: 'a-9', actorName: 'Patryk R.' },
      }),
    )
    expect(card.rows.map((r) => r.labelKey)).toEqual([
      'notifications.card.rowPublicKey',
      'notifications.card.rowType',
      'notifications.card.rowAgentId',
      'notifications.card.rowHostIp',
    ])
    expect(card.rows.some((r) => r.labelKey === 'notifications.card.rowBy')).toBe(false)
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
    // Still the fixed rows (all em-dash) — never collapses.
    expect(card.rows).toHaveLength(4)
    expect(card.rows.every((r) => r.value.kind === 'text' && r.value.text === '—')).toBe(true)
    // No agent name → null subtitleAgent + the "Unknown agent" fallback key the
    // card resolves into the subtitle (title stays the localized type name).
    expect(card.titleKey).toBe('notifications.type.agentPending')
    expect(card.subtitleAgent).toBeNull()
    expect(card.subtitleAgentFallbackKey).toBe('grants.unknownAgent')
  })
})
