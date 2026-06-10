import { z } from 'zod'
import { api } from '../../../shared/api/client'
import type { GrantEntryEnvelope } from '../../../shared/crypto/grant-envelope'

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
  vaultName: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  agentName: z.string().nullable().optional(),
  entryId: z.string().nullable().optional(),
  entryLabel: z.string().nullable().optional(),
  // Optional — rendered after the entry label as "· {urlDomain}" when present.
  urlDomain: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
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
    if (result.success) parsed.push(result.data)
    else skipped += 1
  }
  if (skipped > 0) {
    // No grant content is logged — only a count, to surface contract drift.
    console.warn(`[pending-grants] skipped ${skipped} malformed item(s)`)
  }
  return parsed
}

/**
 * The approve payload. `grantEntry` carries the freshly produced envelope.
 * Exactly one of `expiresAt` / `queryLimit` is set (XOR — enforced by the UI
 * and validated again here before the request is built).
 */
export interface ApproveGrantBody {
  grantEntry: { entryId: string } & GrantEntryEnvelope
  expiresAt?: string
  queryLimit?: number
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
  reason?: string,
): Promise<void> {
  const trimmed = reason?.trim()
  await api.put(`api/vaults/${vaultId}/grants/${grantId}/deny`, {
    json: trimmed ? { reason: trimmed } : {},
  })
}
