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
  'vault.exported',
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
 * No secrets, ciphertext or presentation names are accepted here. The canonical
 * audit contract is structural; every display label is resolved from authorized
 * client state after parsing. Zod strips legacy denormalized fields from older
 * servers so they can never silently become a presentation fallback.
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
  vaultId: z.string().nullable().optional(),
  entryId: z.string().nullable().optional(),
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


/**
 * The backend binds `from`/`to` to NodaTime `Instant` — a bare `YYYY-MM-DD`
 * from the native date input fails model binding with a 400. The date is
 * deliberately interpreted as the user's LOCAL wall-clock day and converted
 * to UTC (from = local midnight, to = local 23:59:59), so "from July 4" in
 * CEST reaches the API as 2026-07-03T22:00:00Z — the user's calendar day,
 * not the UTC one.
 */
function dateParamToInstant(value: string, endOfDay: boolean): string {
  const iso = value.includes('T')
    ? value
    : new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString()
  // NodaTime's Instant binder rejects fractional seconds — strip milliseconds.
  return iso.replace(/\.\d{3}Z$/, 'Z')
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
  if (params.from) searchParams.set('from', dateParamToInstant(params.from, false))
  if (params.to) searchParams.set('to', dateParamToInstant(params.to, true))
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
  if (params.from) searchParams.set('from', dateParamToInstant(params.from, false))
  if (params.to) searchParams.set('to', dateParamToInstant(params.to, true))
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const raw = await api.get('api/audit-logs', { searchParams }).json()
  return parseAuditLogPage(raw)
}

export interface AuditExportStatus {
  jobId: string
  status: string
  rowCount: number | null
  downloadable: boolean
}

/** Queue an async CSV export with the same filters as the list. Returns the job id. */
export async function requestAuditExport(params: {
  vaultId?: string
  agentId?: string
  userId?: string
  eventType?: string
  from?: string
  to?: string
}): Promise<string> {
  const body: Record<string, unknown> = {}
  if (params.vaultId) body.vaultId = params.vaultId
  if (params.agentId) body.agentId = params.agentId
  if (params.userId) body.userId = params.userId
  if (params.eventType) body.eventType = params.eventType
  if (params.from) body.from = dateParamToInstant(params.from, false)
  if (params.to) body.to = dateParamToInstant(params.to, true)
  const res = await api.post('api/audit-logs/export', { json: body }).json<{ jobId: string }>()
  return res.jobId
}

export async function getAuditExport(jobId: string): Promise<AuditExportStatus> {
  return api.get(`api/audit-logs/export/${jobId}`).json<AuditExportStatus>()
}

export async function getAuditExportDownloadUrl(jobId: string): Promise<string> {
  const res = await api
    .get(`api/audit-logs/export/${jobId}/download`)
    .json<{ downloadUrl: string }>()
  return res.downloadUrl
}
