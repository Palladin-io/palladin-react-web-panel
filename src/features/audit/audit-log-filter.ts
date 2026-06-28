import type { AuditLogItem } from './api/audit-api'

export interface AuditLogFilter {
  /** Restrict to a single entry — the Entry Logs tab always sets this. */
  entryId?: string
  /** Restrict to one or more agents (empty/undefined = any). */
  agentId?: string | string[]
  /** Restrict to one or more event types (empty/undefined = any). */
  eventType?: string | string[]
  /** Free-text search over entry label, agent reason and event type. */
  search?: string
  /** id → display name lookup so search can match agents by name. */
  agentNameById?: Record<string, string>
}

/** Normalise an optional single/array filter value to an array. */
function toArray(value: string | string[] | undefined): string[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * Pure client-side filter for audit rows. The Entry Logs tab over-fetches the
 * vault log (no entry-level backend filter exists yet) and narrows here — the
 * `entryId` match is a security guard that keeps other entries' rows out of an
 * entry's tab regardless of what the server returns. `agentId`/`eventType`
 * accept a single value or a list (multi-select); an empty list means "any".
 */
export function filterAuditLogs(
  items: AuditLogItem[],
  filter: AuditLogFilter,
): AuditLogItem[] {
  const q = filter.search?.trim().toLowerCase() ?? ''
  const agentIds = toArray(filter.agentId)
  const eventTypes = toArray(filter.eventType)
  return items.filter((item) => {
    if (filter.entryId && item.entryId !== filter.entryId) return false
    if (agentIds.length && (!item.agentId || !agentIds.includes(item.agentId))) return false
    if (eventTypes.length && !eventTypes.includes(item.eventType)) return false
    if (!q) return true
    const agentName = item.agentId
      ? filter.agentNameById?.[item.agentId]
      : undefined
    return [item.entryLabel, item.agentReason, item.eventType, agentName]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(q))
  })
}
