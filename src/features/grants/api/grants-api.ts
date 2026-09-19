import { api } from '../../../shared/api/client'
import type { GrantType } from './org-grants-api'

/**
 * Grant lifecycle status — camelCase strings matching the backend
 * JsonStringEnumConverter. Mirrors the `Status` enum on the Grant entity:
 * PENDING / ACTIVE / EXPIRED / REVOKED / CONSUMED / DENIED / SUPERSEDED.
 */
export const GRANT_STATUS_PENDING = 'pending' as const
export const GRANT_STATUS_ACTIVE = 'active' as const
export const GRANT_STATUS_EXPIRED = 'expired' as const
export const GRANT_STATUS_REVOKED = 'revoked' as const
export const GRANT_STATUS_CONSUMED = 'consumed' as const
export const GRANT_STATUS_DENIED = 'denied' as const
export const GRANT_STATUS_SUPERSEDED = 'superseded' as const

export const GRANT_STATUSES = [
  GRANT_STATUS_PENDING,
  GRANT_STATUS_ACTIVE,
  GRANT_STATUS_EXPIRED,
  GRANT_STATUS_REVOKED,
  GRANT_STATUS_CONSUMED,
  GRANT_STATUS_DENIED,
  GRANT_STATUS_SUPERSEDED,
] as const

export type GrantStatus = string

/**
 * A grant as returned by the management list/detail endpoints.
 *
 * IMPORTANT: this contract carries NO crypto material — no VK, no DEK, no
 * re-encrypted blobs. Those live only on the GrantEntry rows and never reach
 * the management surface. This is the backend projection contract.
 */

export interface Grant {
  grantId: string
  vaultId: string
  agentId: string | null
  agentName: string | null
  entryId: string | null
  status: string
  type: GrantType
  expiresAt: string | null
  queryLimit: number | null
  queryCount: number
  createdAt: string
  createdByName: string | null
  revokedAt: string | null
  revokedByName: string | null
  entryLabel?: string | null
  methods?: string | null
  supersededAt?: string | null
  supersededByGrantId?: string | null
  reason?: string | null
  revokeReason?: string | null
}

// The wire contract uses `id`; existing UI routes use `grantId`.
type GrantResponse = Omit<Grant, 'grantId'> & { id: string; grantId?: string }
function toGrant({ id, ...grant }: GrantResponse): Grant {
  return { ...grant, grantId: grant.grantId ?? id }
}

export type { GrantType }

/** Cursor-paginated management list. */
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

/** Per-vault management list, using the authoritative backend contract. */
export async function getVaultGrants(
  vaultId: string,
  params: GetVaultGrantsParams = {},
): Promise<GrantPage> {
  const searchParams = new URLSearchParams()
  if (params.status) searchParams.set('status', params.status)
  if (params.agentId) searchParams.set('agentId', params.agentId)
  if (params.cursor) searchParams.set('cursor', params.cursor)
  if (params.pageSize) searchParams.set('pageSize', String(params.pageSize))

  const page = await api
    .get(`api/vaults/${vaultId}/grants`, { searchParams })
    .json<{ items: GrantResponse[]; nextCursor: string | null }>()
  return { items: page.items.map(toGrant), nextCursor: page.nextCursor ?? null }
}

export async function getGrant(vaultId: string, grantId: string): Promise<Grant> {
  const response = await api.get(`api/vaults/${vaultId}/grants/${grantId}`).json<GrantResponse>()
  return toGrant(response)
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
  const trimmedReason = reason?.trim()
  await api.delete(
    `api/vaults/${vaultId}/grants/${grantId}`,
    trimmedReason ? { json: { reason: trimmedReason } } : undefined,
  )
}
