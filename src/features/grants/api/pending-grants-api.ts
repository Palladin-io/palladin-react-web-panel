import { z } from 'zod'
import { api } from '../../../shared/api/client'
import type { GrantEntryEnvelope } from '../../../shared/crypto/grant-envelope'

/**
 * A pending GRANULAR grant awaiting the user's approval. Cross-vault — returned
 * by `GET /api/dashboard/pending-grants`.
 *
 * Carries `agentPublicKey` (base64 X25519) — the key the agent supplied in its
 * request — which the approval flow seals the per-grant DEK to. This is the
 * agent's PUBLIC key only; it is not sensitive. No VK/DEK/plaintext is present.
 */
const pendingGrantSchema = z.object({
  grantId: z.string(),
  vaultId: z.string(),
  vaultName: z.string().nullable(),
  agentId: z.string().nullable(),
  agentName: z.string().nullable(),
  /** base64 X25519 public key the DEK is sealed to on approval. */
  agentPublicKey: z.string(),
  entryId: z.string(),
  entryLabel: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
})

export type PendingGrant = z.infer<typeof pendingGrantSchema>

const pendingGrantListSchema = z.object({
  items: z.array(pendingGrantSchema),
})

export async function getPendingGrants(): Promise<PendingGrant[]> {
  const raw = await api.get('api/dashboard/pending-grants').json()
  return pendingGrantListSchema.parse(raw).items
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
