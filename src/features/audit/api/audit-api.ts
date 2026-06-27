import { z } from 'zod'
import { api } from '../../../shared/api/client'

/**
 * Audit event identifiers (dot-notation) — mirror the backend
 * `AuditEventType` constants. Kept as a closed union so the row component and
 * the event-type filter can exhaustively map icon/colour/label per event.
 */
export const AUDIT_EVENT_TYPES = [
  'credential.accessed',
  'credential.access-denied',
  'grant.requested',
  'grant.created',
  'grant.approved',
  'grant.denied',
  'grant.revoked',
  'grant.consumed',
  'grant.expired',
  'agent.enrolled',
  'agent.blocked',
  'agent.reactivated',
  'agent.deleted',
  'vault.created',
  'vault.updated',
  'vault.deleted',
  'entry.created',
  'entry.updated',
  'entry.deleted',
] as const

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number]

/** Who performed the action — backend `AuditActorType` (camelCase JSON). */
export const AUDIT_ACTOR_TYPES = ['user', 'agent', 'system'] as const
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number]

/**
 * One audit row from `GET /api/vaults/{id}/audit-logs` (`AuditLogListItem`).
 * No secrets or ciphertext are ever returned. `entryLabel` is denormalised
 * server-side today; `agentName`/`actorName` are not yet (tracked by CVT-181) —
 * they are accepted here as optional so the UI uses the server value the moment
 * the backend ships it, falling back to client-side resolution until then.
 *
 * `eventType` is parsed loosely (`z.string()`) so a future backend event type
 * never collapses the whole page; the row component falls back to a neutral
 * presentation for anything outside `AUDIT_EVENT_TYPES`.
 */
export const auditLogItemSchema = z.object({
  id: z.string(),
  eventType: z.string(),
  actorType: z.enum(AUDIT_ACTOR_TYPES).catch('system'),
  userId: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  agentName: z.string().nullable().optional(),
  actorName: z.string().nullable().optional(),
  vaultId: z.string().nullable().optional(),
  entryId: z.string().nullable().optional(),
  entryLabel: z.string().nullable().optional(),
  agentReason: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).default({}),
  createdAt: z.string(),
})

export type AuditLogItem = z.infer<typeof auditLogItemSchema>

const auditLogPageSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional(),
})

export interface GetVaultAuditLogsParams {
  /** Comma-joined event types — backend `actions` filter. */
  actions?: string
  agentId?: string
  cursor?: string
  pageSize?: number
}

export interface AuditLogPage {
  items: AuditLogItem[]
  nextCursor: string | null
}

/**
 * Vault-scoped audit log, newest-first. Each item is parsed individually with
 * `safeParse` so one malformed row never collapses the whole list.
 *
 * NOTE: the backend exposes no entry-level filter, so the Entry Logs tab fetches
 * the vault log and narrows to a single entry client-side.
 */
export async function getVaultAuditLogs(
  vaultId: string,
  params: GetVaultAuditLogsParams = {},
): Promise<AuditLogPage> {
  const searchParams = new URLSearchParams()
  if (params.actions) searchParams.set('actions', params.actions)
  if (params.agentId) searchParams.set('agentId', params.agentId)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const raw = await api
    .get(`api/vaults/${vaultId}/audit-logs`, { searchParams })
    .json()
  const page = auditLogPageSchema.parse(raw)

  const items: AuditLogItem[] = []
  let skipped = 0
  for (const item of page.items) {
    const result = auditLogItemSchema.safeParse(item)
    if (result.success) items.push(result.data)
    else skipped += 1
  }
  if (skipped > 0) {
    console.warn(`[audit-logs] skipped ${skipped} malformed item(s)`)
  }
  return { items, nextCursor: page.nextCursor ?? null }
}
