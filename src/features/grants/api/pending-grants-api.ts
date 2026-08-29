import { api } from '../../../shared/api/client'
import type { buildCanonicalGrantEnvelope } from '../../../shared/crypto/grant-protocol'
import type { EncryptedReasonContract } from '../../../shared/crypto/reason-protocol'
import type { buildCompleteScriptExecutionPackage } from '../../vaults/script-execution-package'
import { encryptedReasonEnvelopeSchema } from '../../vaults/sync/entry-envelope-schema'

export interface GrantEntryScope {
  entryId: string
  fieldIds: string[]
  grantEnvelopeRevision: string | null
  entryRevision: string | null
  grantKeyVersion: number | null
  memberKeyGeneration: number | null
  recipientAgentKeyVersion: number | null
  agentKeyFingerprint: string | null
}

export interface ScriptExecutionScope {
  entryId: string
  entryRevision: string
  isScript: boolean
}

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
export interface PendingGrant {
  id: string
  vaultId: string
  agentId: string | null
  agentAccessEpoch: number | null
  agentName: string | null
  agentIconKey: string | null
  agentPublicKey: string | null
  recipientAgentKeyVersion: number | null
  agentSigningPublicKey: string | null
  agentSigningKeyVersion: number | null
  agentSigningKeyFingerprint: string | null
  type: 'full' | 'granular' | 'scriptExecution'
  status: 'pending'
  methods: string
  entryId: string | null
  entryLabel: string | null
  urlDomain: string | null
  entryScopes: GrantEntryScope[]
  scriptScopes: ScriptExecutionScope[]
  scriptPackageRevision: string | null
  encryptedReason: EncryptedReasonContract
  expiresAt: string | null
  queryLimit: number | null
  queryCount: number
  expirySource: string
  createdAt: string
  createdBy: string | null
  createdByName: string | null
  revokedAt: string | null
  revokedBy: string | null
  revokedByName: string | null
  supersededAt: string | null
  supersededByGrantId: string | null
  deniedAt: string | null
  deniedBy: string | null
  deniedByName: string | null
  lastAccessedAt: string | null
  lastAccessIp: string | null
  lastAccessHostname: string | null
  canRevoke: boolean
  canGrantAgain: boolean
  activeCoveringGrantIds: string[]
}

interface PendingGrantWire extends Omit<PendingGrant, 'encryptedReason' | 'activeCoveringGrantIds'> {
  encryptedReason: unknown
  activeCoveringGrantIds?: string[]
}

interface PendingGrantListResponse {
  items: unknown
  nextCursor: string | null
}

/**
 * Fetches the trusted first-party pending-grant contract without duplicating
 * backend-owned domain validation in the UI. The encrypted reason remains a
 * cryptographic boundary: decoding it normalizes wire enums and fails closed
 * per malformed row before any signature, scope or wrapper verification is
 * attempted. One invalid request must not hide unrelated valid requests.
 */
export async function getPendingGrants(): Promise<PendingGrant[]> {
  const response = await api.get('api/dashboard/pending-grants').json<PendingGrantListResponse>()
  if (!Array.isArray(response.items)) return []

  return response.items.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const grant = candidate as PendingGrantWire
    const encryptedReason = encryptedReasonEnvelopeSchema.safeParse(grant.encryptedReason)
    if (!encryptedReason.success) return []

    return [{
      ...grant,
      activeCoveringGrantIds: grant.activeCoveringGrantIds ?? [],
      encryptedReason: encryptedReason.data,
    }]
  })
}

/**
 * The approve payload. `grantEntry` carries the freshly produced envelope.
 * Exactly one of `expiresAt` / `queryLimit` is set (XOR — enforced by the UI
 * and validated again here before the request is built).
 */
export interface ApproveGrantBody {
  grantEntry?: Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>
  scriptPackage?: Awaited<ReturnType<typeof buildCompleteScriptExecutionPackage>>
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
