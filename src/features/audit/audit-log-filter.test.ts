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
    entryLabel: 'Legacy server label',
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

  it('searches locally resolved entry names without requiring a server label', () => {
    const result = filterAuditLogs(rows, {
      search: 'stripe',
      entryNameById: { 'entry-1': 'Stripe API Key' },
    })
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'd'])
    expect(filterAuditLogs(rows, { search: 'stripe' })).toEqual([])
  })

  it('narrows to multiple agents (multi-select)', () => {
    const result = filterAuditLogs(rows, { entryId: 'entry-1', agentId: ['agent-1', 'agent-2'] })
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'd'])
  })

  it('narrows to multiple event types (multi-select)', () => {
    const result = filterAuditLogs(rows, {
      entryId: 'entry-1',
      eventType: ['grant.revoked', 'grant.created'],
    })
    expect(result.map((r) => r.id)).toEqual(['b', 'd'])
  })

  it('treats an empty filter array as "any"', () => {
    const result = filterAuditLogs(rows, { entryId: 'entry-1', agentId: [], eventType: [] })
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'd'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterAuditLogs(rows, { entryId: 'missing' })).toEqual([])
  })

  it('narrows by inclusive date bounds (from/to on the createdAt day)', () => {
    const dated = [
      item({ id: 'jun25', createdAt: '2026-06-25T23:00:00Z' }),
      item({ id: 'jun27', createdAt: '2026-06-27T10:00:00Z' }),
      item({ id: 'jun29', createdAt: '2026-06-29T01:00:00Z' }),
    ]
    expect(filterAuditLogs(dated, { from: '2026-06-27' }).map((r) => r.id)).toEqual(['jun27', 'jun29'])
    expect(filterAuditLogs(dated, { to: '2026-06-27' }).map((r) => r.id)).toEqual(['jun25', 'jun27'])
    // The `to` bound is inclusive of the whole day regardless of time-of-day.
    expect(
      filterAuditLogs(dated, { from: '2026-06-27', to: '2026-06-27' }).map((r) => r.id),
    ).toEqual(['jun27'])
  })
})
