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
  'apikey.created',
  'apikey.activated',
  'apikey.revoked',
  'apikey.deleted',
  'org.created',
  'org.updated',
  'user.signed-up',
  'account.setup-completed',
  'account.recovery-completed',
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
  /** Comma-joined event types — backend `actions` filter (`IN`). */
  actions?: string
  /** Comma-joined agent ids (`IN`). */
  agentId?: string
  /** Comma-joined acting-user ids (human actors, `IN`). */
  userId?: string
  entryId?: string
  /** Inclusive lower bound (`YYYY-MM-DD` or ISO instant). */
  from?: string
  /** Inclusive upper bound (`YYYY-MM-DD` or ISO instant). */
  to?: string
  cursor?: string
  pageSize?: number
}

/**
 * Org-scoped audit log filters (`GET /api/audit-logs`). The vault is itself a
 * filter dimension here (`vaultId`). The multi-value filters (`vaultId`,
 * `agentId`, `userId`, `eventType`) are comma-joined CSV strings the backend
 * reads as an `IN (...)` filter — built from the UI multi-selects via
 * `csvParam`. Empty selection → omit the param.
 */
export interface GetOrgAuditLogsParams {
  /** Comma-joined vault ids (`IN`). */
  vaultId?: string
  /** Comma-joined agent ids (`IN`). */
  agentId?: string
  /** Comma-joined acting-user ids (human actors, `IN`). */
  userId?: string
  entryId?: string
  /** Comma-joined event types (`IN`). */
  eventType?: string
  from?: string
  to?: string
  cursor?: string
  pageSize?: number
}

export interface AuditLogPage {
  items: AuditLogItem[]
  nextCursor: string | null
}

/** Parse a raw page, dropping malformed rows so one bad item never blanks the list. */
function parseAuditLogPage(raw: unknown): AuditLogPage {
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

/**
 * Vault-scoped audit log, newest-first. Each item is parsed individually with
 * `safeParse` so one malformed row never collapses the whole list.
 */
export async function getVaultAuditLogs(
  vaultId: string,
  params: GetVaultAuditLogsParams = {},
): Promise<AuditLogPage> {
  const searchParams = new URLSearchParams()
  if (params.actions) searchParams.set('actions', params.actions)
  if (params.agentId) searchParams.set('agentId', params.agentId)
  if (params.userId) searchParams.set('userId', params.userId)
  if (params.entryId) searchParams.set('entryId', params.entryId)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const raw = await api
    .get(`api/vaults/${vaultId}/audit-logs`, { searchParams })
    .json()
  return parseAuditLogPage(raw)
}

/**
 * Org-wide audit log, newest-first — backs the global Audit Log screen.
 * Same row shape and parsing guarantees as the vault-scoped endpoint.
 */
export async function getOrgAuditLogs(
  params: GetOrgAuditLogsParams = {},
): Promise<AuditLogPage> {
  const searchParams = new URLSearchParams()
  if (params.vaultId) searchParams.set('vaultId', params.vaultId)
  if (params.agentId) searchParams.set('agentId', params.agentId)
  if (params.userId) searchParams.set('userId', params.userId)
  if (params.entryId) searchParams.set('entryId', params.entryId)
  if (params.eventType) searchParams.set('eventType', params.eventType)
  if (params.from) searchParams.set('from', params.from)
  if (params.to) searchParams.set('to', params.to)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const raw = await api.get('api/audit-logs', { searchParams }).json()
  return parseAuditLogPage(raw)
}
