import { z } from 'zod'
import { api } from '../../../shared/api/client'
import type { EncryptedReasonContract } from '../../../shared/crypto/reason-protocol'

/**
 * A pending grant awaiting the user's approval. Cross-vault — returned by
 * `GET /api/dashboard/pending-grants`. Shape mirrors the backend `GrantResponse`
 * projection (camelCase). No crypto material (VK/DEK/plaintext) is present.
 *
 * `agentName` / `entryLabel` are display names enriched by the backend; the UI
 * shows these instead of raw ids. `agentPublicKey` is currently NOT returned by
 * this endpoint — it is required to build the approval envelope, so approve is
 * blocked until the backend adds it (see `use-approve-grant.ts`). Modelled as
 * optional so the list still renders without it.
 */
const pendingGrantSchema = z.object({
  // Backend field is `id` — this is the grant id used for approve/deny.
  id: z.string(),
  vaultId: z.string(),
  // Display name enriched by the backend; shown instead of the vault id.
  agentId: z.string().nullable().optional(),
  agentName: z.string().nullable().optional(),
  entryId: z.string().nullable().optional(),
  encryptedReason: z.unknown().nullable().optional(),
  // Combined-flags string the agent requested, e.g. "get, exec" (CVT-149). Optional for
  // pre-methods backends; the approve dialog falls back to a sensible default when absent.
  methods: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  queryLimit: z.number().nullable().optional(),
  queryCount: z.number().nullable().optional(),
  expirySource: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().nullable().optional(),
  revokedAt: z.string().nullable().optional(),
  revokedBy: z.string().nullable().optional(),
  revokeReason: z.string().nullable().optional(),
  // Not yet returned by the endpoint — optional until the backend adds it.
  agentPublicKey: z.string().nullable().optional(),
})

export type PendingGrant = z.infer<typeof pendingGrantSchema>
  & {
    encryptedReason?: EncryptedReasonContract | null
    reason?: string
    vaultName?: string
    entryLabel?: string
    urlDomain?: string
  }

const pendingGrantListSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional(),
})

/**
 * Fetches pending grants. Each item is parsed individually with `safeParse` so
 * a single malformed record is skipped (and logged as a count) rather than
 * collapsing the whole list to an empty render.
 */
export async function getPendingGrants(): Promise<PendingGrant[]> {
  const raw = await api.get('api/dashboard/pending-grants').json()
  const envelope = pendingGrantListSchema.parse(raw)

  const parsed: PendingGrant[] = []
  let skipped = 0
  for (const item of envelope.items) {
    const result = pendingGrantSchema.safeParse(item)
    if (result.success) parsed.push(result.data as PendingGrant)
    else skipped += 1
  }
  if (skipped > 0) {
    // No grant content is logged — only a count, to surface contract drift.
    console.warn(`[pending-grants] skipped ${skipped} malformed item(s)`)
  }
  return parsed
}

export async function getPendingGrantDetail(vaultId: string, grantId: string): Promise<PendingGrant> {
  return pendingGrantSchema.parse(
    await api.get(`api/vaults/${vaultId}/grants/${grantId}`).json(),
  ) as PendingGrant
}

/**
 * The approve payload. `grantEntry` carries the freshly produced envelope.
 * Exactly one of `expiresAt` / `queryLimit` is set (XOR — enforced by the UI
 * and validated again here before the request is built).
 */
export interface ApproveGrantBody {
  grantEntry: unknown
  expiresAt?: string
  queryLimit?: number
  /** Combined-flags string of the methods the agent may use, e.g. "Get, Exec" (CVT-149). */
  methods?: string
}

export async function approveGrant(
  vaultId: string,
  grantId: string,
  body: ApproveGrantBody,
): Promise<void> {
  await api.put(`api/vaults/${vaultId}/grants/${grantId}/approve`, { json: body })
}

export async function denyGrant(
  vaultId: string,
  grantId: string,
  _reason?: string,
): Promise<void> {
  void _reason
  await api.put(`api/vaults/${vaultId}/grants/${grantId}/deny`)
}
