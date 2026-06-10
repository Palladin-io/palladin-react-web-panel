import { z } from 'zod'
import { api } from '../../../shared/api/client'

/**
 * Grant lifecycle status — camelCase strings matching the backend
 * JsonStringEnumConverter. Mirrors the `Status` enum on the Grant entity:
 * PENDING / ACTIVE / EXPIRED / REVOKED / CONSUMED / DENIED.
 */
export const GRANT_STATUS_PENDING = 'pending' as const
export const GRANT_STATUS_ACTIVE = 'active' as const
export const GRANT_STATUS_EXPIRED = 'expired' as const
export const GRANT_STATUS_REVOKED = 'revoked' as const
export const GRANT_STATUS_CONSUMED = 'consumed' as const
export const GRANT_STATUS_DENIED = 'denied' as const

export const GRANT_STATUSES = [
  GRANT_STATUS_PENDING,
  GRANT_STATUS_ACTIVE,
  GRANT_STATUS_EXPIRED,
  GRANT_STATUS_REVOKED,
  GRANT_STATUS_CONSUMED,
  GRANT_STATUS_DENIED,
] as const

export type GrantStatus = (typeof GRANT_STATUSES)[number]

/** Grant mode — FULL (whole vault) or GRANULAR (single entry). */
export const GRANT_MODE_FULL = 'full' as const
export const GRANT_MODE_GRANULAR = 'granular' as const
export type GrantMode = typeof GRANT_MODE_FULL | typeof GRANT_MODE_GRANULAR

/**
 * A grant as returned by the management list/detail endpoints.
 *
 * IMPORTANT: this contract carries NO crypto material — no VK, no DEK, no
 * re-encrypted blobs. Those live only on the GrantEntry rows and never reach
 * the management surface. Parsing here is the boundary guard that keeps the
 * UI honest about that.
 */
const grantSchema = z.object({
  grantId: z.string(),
  vaultId: z.string(),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  entryId: z.string().nullable(),
  entryLabel: z.string().nullable(),
  status: z.enum(GRANT_STATUSES),
  mode: z.enum([GRANT_MODE_FULL, GRANT_MODE_GRANULAR]),
  // Combined-flags string of permitted methods, e.g. "get, exec" (CVT-149). Optional for
  // pre-methods backends; the detail row is hidden when absent/empty.
  methods: z.string().nullable().optional(),
  reason: z.string().nullable(),
  expiresAt: z.string().nullable(),
  queryLimit: z.number().nullable(),
  queryCount: z.number(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revokedByName: z.string().nullable(),
  revokeReason: z.string().nullable(),
})

export type Grant = z.infer<typeof grantSchema>

/** Cursor-paginated list envelope — items are parsed per-row below. */
const grantPageEnvelopeSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional(),
})

export interface GrantPage {
  items: Grant[]
  nextCursor: string | null
}

export interface GetVaultGrantsParams {
  status?: GrantStatus
  agentId?: string
  cursor?: string
  pageSize?: number
}

/**
 * Per-vault grants list. Each item is parsed individually with `safeParse`
 * (mirrors `getOrgGrants`) so a single malformed row never collapses the entire
 * list into an `ErrorState`.
 */
export async function getVaultGrants(
  vaultId: string,
  params: GetVaultGrantsParams = {},
): Promise<GrantPage> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.agentId) searchParams.set('agentId', params.agentId)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const raw = await api
    .get(`api/vaults/${vaultId}/grants`, { searchParams })
    .json()
  const page = grantPageEnvelopeSchema.parse(raw)

  const items: Grant[] = []
  let skipped = 0
  for (const item of page.items) {
    const result = grantSchema.safeParse(item)
    if (result.success) items.push(result.data)
    else skipped += 1
  }
  if (skipped > 0) {
    console.warn(`[vault-grants] skipped ${skipped} malformed item(s)`)
  }
  return { items, nextCursor: page.nextCursor ?? null }
}

export async function getGrant(vaultId: string, grantId: string): Promise<Grant> {
  const raw = await api.get(`api/vaults/${vaultId}/grants/${grantId}`).json()
  return grantSchema.parse(raw)
}

/**
 * Revoke an active grant. `reason` is optional (max 500 chars, enforced by the
 * backend); an empty/undefined reason revokes without a recorded reason.
 */
export async function revokeGrant(
  vaultId: string,
  grantId: string,
  reason?: string,
): Promise<void> {
  const trimmed = reason?.trim()
  await api.delete(`api/vaults/${vaultId}/grants/${grantId}`, {
    json: trimmed ? { reason: trimmed } : {},
  })
}
