import { describe, expect, it } from 'vitest'
import { filterAuditLogs } from './audit-log-filter'
import type { AuditLogItem } from './api/audit-api'

function item(overrides: Partial<AuditLogItem>): AuditLogItem {
  return {
    id: crypto.randomUUID(),
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

describe('filterAuditLogs', () => {
  const rows: AuditLogItem[] = [
    item({ id: 'a', entryId: 'entry-1', agentId: 'agent-1', eventType: 'credential.accessed' }),
    item({ id: 'b', entryId: 'entry-1', agentId: 'agent-2', eventType: 'grant.revoked' }),
    item({ id: 'c', entryId: 'entry-2', agentId: 'agent-1', eventType: 'credential.accessed' }),
    item({ id: 'd', entryId: 'entry-1', agentId: 'agent-1', eventType: 'grant.created', agentReason: 'CI deploy' }),
  ]

  it('keeps only rows for the scoped entry — guards against other entries leaking in', () => {
    const result = filterAuditLogs(rows, { entryId: 'entry-1' })
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'd'])
  })

  it('narrows to a single agent within the entry', () => {
    const result = filterAuditLogs(rows, { entryId: 'entry-1', agentId: 'agent-1' })
    expect(result.map((r) => r.id)).toEqual(['a', 'd'])
  })

  it('narrows to a single event type', () => {
    const result = filterAuditLogs(rows, { entryId: 'entry-1', eventType: 'grant.revoked' })
    expect(result.map((r) => r.id)).toEqual(['b'])
  })

  it('combines agent and event-type filters', () => {
    const result = filterAuditLogs(rows, {
      entryId: 'entry-1',
      agentId: 'agent-1',
      eventType: 'credential.accessed',
    })
    expect(result.map((r) => r.id)).toEqual(['a'])
  })

  it('searches the agent reason', () => {
    const result = filterAuditLogs(rows, { entryId: 'entry-1', search: 'deploy' })
    expect(result.map((r) => r.id)).toEqual(['d'])
  })

  it('searches by agent display name via the id→name map', () => {
    const result = filterAuditLogs(rows, {
      entryId: 'entry-1',
      search: 'copilot',
      agentNameById: { 'agent-2': 'github-copilot' },
    })
    expect(result.map((r) => r.id)).toEqual(['b'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterAuditLogs(rows, { entryId: 'missing' })).toEqual([])
  })
})
