import type { AuditLogItem } from './api/audit-api'

export interface AuditLogFilter {
  /** Restrict to a single entry — the Entry Logs tab always sets this. */
  entryId?: string
  /** Restrict to a single agent. */
  agentId?: string
  /** Restrict to a single event type. */
  eventType?: string
  /** Free-text search over entry label, agent reason and event type. */
  search?: string
  /** id → display name lookup so search can match agents by name. */
  agentNameById?: Record<string, string>
}

/**
 * Pure client-side filter for audit rows. The Entry Logs tab over-fetches the
 * vault log (no entry-level backend filter exists yet) and narrows here — the
 * `entryId` match is a security guard that keeps other entries' rows out of an
 * entry's tab regardless of what the server returns.
 */
export function filterAuditLogs(
  items: AuditLogItem[],
  filter: AuditLogFilter,
): AuditLogItem[] {
  const q = filter.search?.trim().toLowerCase() ?? ''
  return items.filter((item) => {
    if (filter.entryId && item.entryId !== filter.entryId) return false
    if (filter.agentId && item.agentId !== filter.agentId) return false
    if (filter.eventType && item.eventType !== filter.eventType) return false
    if (!q) return true
    const agentName = item.agentId
      ? filter.agentNameById?.[item.agentId]
      : undefined
    return [item.entryLabel, item.agentReason, item.eventType, agentName]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })
}
