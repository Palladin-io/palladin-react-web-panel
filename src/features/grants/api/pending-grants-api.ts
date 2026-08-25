import { z } from 'zod'
import { api } from '../../../shared/api/client'
import type { buildCanonicalGrantEnvelope } from '../../../shared/crypto/grant-protocol'
import { encryptedReasonEnvelopeSchema } from '../../vaults/sync/entry-envelope-schema'
import { canonicalUuidSchema, u32Schema } from '../../vaults/sync/vault-key-material-schema'

const grantEntryScopeSchema = z.object({
  entryId: canonicalUuidSchema,
  fieldIds: z.array(z.string()),
  grantEnvelopeRevision: z.string().nullable(),
  entryRevision: z.string().nullable(),
  grantKeyVersion: u32Schema.nullable(),
  memberKeyGeneration: u32Schema.nullable(),
  recipientAgentKeyVersion: u32Schema.nullable(),
  agentKeyFingerprint: z.string().nullable(),
}).strict()

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
  id: canonicalUuidSchema,
  vaultId: canonicalUuidSchema,
  agentId: canonicalUuidSchema.nullable(),
  agentName: z.string().nullable(),
  agentIconKey: z.string().nullable(),
  agentPublicKey: z.string().nullable(),
  recipientAgentKeyVersion: u32Schema.nullable(),
  agentSigningPublicKey: z.string().nullable(),
  agentSigningKeyVersion: u32Schema.nullable(),
  agentSigningKeyFingerprint: z.string().nullable(),
  type: z.enum(['full', 'granular']),
  status: z.literal('pending'),
  methods: z.string(),
  entryId: canonicalUuidSchema.nullable(),
  entryLabel: z.string().nullable(),
  urlDomain: z.string().nullable(),
  entryScopes: z.array(grantEntryScopeSchema),
  encryptedReason: encryptedReasonEnvelopeSchema,
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  queryLimit: z.number().int().positive().nullable(),
  queryCount: z.number().int().nonnegative(),
  expirySource: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: canonicalUuidSchema.nullable(),
  createdByName: z.string().nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(),
  revokedBy: canonicalUuidSchema.nullable(),
  revokedByName: z.string().nullable(),
  deniedAt: z.string().datetime({ offset: true }).nullable(),
  deniedBy: canonicalUuidSchema.nullable(),
  deniedByName: z.string().nullable(),
  lastAccessedAt: z.string().datetime({ offset: true }).nullable(),
  lastAccessIp: z.string().nullable(),
  lastAccessHostname: z.string().nullable(),
  canRevoke: z.boolean(),
  canGrantAgain: z.boolean(),
  activeCoveringGrantIds: z.array(canonicalUuidSchema),
}).strict().superRefine((grant, context) => {
  const scope = grant.encryptedReason.descriptor.scope
  if (scope.vaultId !== grant.vaultId || scope.grantOrRequestId !== grant.id
    || scope.agentId !== grant.agentId || scope.entryId !== grant.entryId) {
    context.addIssue({ code: 'custom', message: 'Pending grant encrypted reason scope mismatch' })
  }
})

export type PendingGrant = z.infer<typeof pendingGrantSchema>

const pendingGrantListSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
}).strict()

/**
 * Fetches pending grants. Each item is parsed individually with `safeParse` so
 * a single malformed record is skipped (and logged as a count) rather than
 * collapsing the whole list to an empty render.
 */
export async function getPendingGrants(): Promise<PendingGrant[]> {
  const raw = await api.get('api/dashboard/pending-grants').json()
  const envelope = pendingGrantListSchema.parse(raw)

  const items: PendingGrant[] = []
  let skipped = 0
  for (const candidate of envelope.items) {
    const parsed = pendingGrantSchema.safeParse(candidate)
    if (parsed.success) items.push(parsed.data)
    else skipped += 1
  }
  if (skipped > 0) console.warn(`[pending-grants] skipped ${skipped} malformed item(s)`)
  return items
}

/**
 * The approve payload. `grantEntry` carries the freshly produced envelope.
 * Exactly one of `expiresAt` / `queryLimit` is set (XOR — enforced by the UI
 * and validated again here before the request is built).
 */
export interface ApproveGrantBody {
  grantEntry: Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>
  expiresAt?: string
  queryLimit?: number
  /** Combined-flags string of the methods the agent may use, e.g. "Get, Exec". */
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
  reason?: string,
): Promise<void> {
  const trimmed = reason?.trim()
  await api.put(`api/vaults/${vaultId}/grants/${grantId}/deny`, {
    json: trimmed ? { reason: trimmed } : {},
  })
}
