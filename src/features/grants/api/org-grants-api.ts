import type { EncryptedReasonContract } from '../../../shared/crypto/reason-protocol'
import type { GrantFieldSelectionMode } from '../../../shared/types/grant-field-selection'

import { api } from "../../../shared/api/client";
import type { buildCanonicalGrantEnvelope } from "../../../shared/crypto/grant-protocol";
import type { AgentWrappedVaultKeyContract } from "../../../shared/crypto/x25519-wrapper";
import type { ScriptExecutionEncryptedPackageV1 } from "../../../shared/crypto/script-execution";
import { encryptedReasonEnvelopeSchema } from "../../vaults/sync/entry-envelope-schema";

/**
 * Grant lifecycle status — camelCase strings matching the backend
 * JsonStringEnumConverter
 * (PENDING / ACTIVE / EXPIRED / REVOKED / CONSUMED / DENIED / SUPERSEDED).
 */
export const GRANT_STATUS_PENDING = "pending" as const;
export const GRANT_STATUS_ACTIVE = "active" as const;
export const GRANT_STATUS_EXPIRED = "expired" as const;
export const GRANT_STATUS_REVOKED = "revoked" as const;
export const GRANT_STATUS_CONSUMED = "consumed" as const;
export const GRANT_STATUS_DENIED = "denied" as const;
export const GRANT_STATUS_SUPERSEDED = "superseded" as const;

export const GRANT_STATUSES = [
  GRANT_STATUS_PENDING,
  GRANT_STATUS_ACTIVE,
  GRANT_STATUS_EXPIRED,
  GRANT_STATUS_REVOKED,
  GRANT_STATUS_CONSUMED,
  GRANT_STATUS_DENIED,
  GRANT_STATUS_SUPERSEDED,
] as const;

export type GrantStatus = string;

export const GRANT_TYPE_FULL = "full" as const;
export const GRANT_TYPE_GRANULAR = "granular" as const;
export const GRANT_TYPE_SCRIPT_EXECUTION = "scriptExecution" as const;
export type GrantType = typeof GRANT_TYPE_FULL | typeof GRANT_TYPE_GRANULAR
  | typeof GRANT_TYPE_SCRIPT_EXECUTION;

/** Local producer capabilities, not a validator of server-owned history rows. */
export function isCreatableGrantType(type: string): type is GrantType {
  return type === GRANT_TYPE_FULL || type === GRANT_TYPE_GRANULAR || type === GRANT_TYPE_SCRIPT_EXECUTION
}

export function isApprovableGrantType(type: string): type is typeof GRANT_TYPE_GRANULAR | typeof GRANT_TYPE_SCRIPT_EXECUTION {
  return type === GRANT_TYPE_GRANULAR || type === GRANT_TYPE_SCRIPT_EXECUTION
}

/**
 * Org-wide grant row from `GET /api/grants` (enriched `GrantResponse`). No
 * ciphertext (reEncryptedBlob/nonce/agentWrappedDek) is ever returned —
 * `agentPublicKey` IS returned because the client needs it to wrap a DEK when
 * re-granting. Fields the backend may not yet populate are nullable/optional so
 * the UI degrades gracefully.
 */

export interface OrgGrant {
  id: string
  vaultId: string
  type: string
  status: string
  entryScopes: {
    entryId: string
    fieldIds: string[]
    grantEnvelopeRevision: string | null
    entryRevision: string | null
    grantKeyVersion: number | null
    memberKeyGeneration: number | null
    recipientAgentKeyVersion: number | null
    agentKeyFingerprint: string | null
    fieldSelectionMode?: string
    selectedFieldIds?: string[] | null
  }[]
  scriptScopes: {
    entryId: string
    entryRevision: string
    isScript: boolean
  }[]
  createdAt: string
  canRevoke: boolean
  canGrantAgain: boolean
  activeCoveringGrantIds: string[]
  vaultName?: string | null
  agentId?: string | null
  agentAccessEpoch?: number | null
  agentName?: string | null
  agentIconKey?: string | null
  agentPublicKey?: string | null
  recipientAgentKeyVersion?: number | null
  agentSigningPublicKey?: string | null
  agentSigningKeyVersion?: number | null
  agentSigningKeyFingerprint?: string | null
  methods?: string | null
  entryId?: string | null
  scriptEntryId?: string | null
  entryLabel?: string | null
  scriptPackageRevision?: string | null
  reason?: string | null
  encryptedReason?: EncryptedReasonContract | null
  expiresAt?: string | null
  queryLimit?: number | null
  queryCount?: number | null
  expirySource?: string | null
  createdBy?: string | null
  createdByName?: string | null
  revokedBy?: string | null
  revokedByName?: string | null
  supersededAt?: string | null
  supersededByGrantId?: string | null
  deniedBy?: string | null
  deniedByName?: string | null
  revokeReason?: string | null
  denyReason?: string | null
  lastAccessedAt?: string | null
  lastAccessIp?: string | null
  lastAccessHostname?: string | null
}

export interface GetOrgGrantsParams {
  status?: GrantStatus;
  agentId?: string;
  /** Scope to one vault — FULL grants on it + GRANULAR grants on its entries. */
  vaultId?: string;
  /** Scope to a single entry — only GRANULAR grants on that exact entry. */
  entryId?: string;
  query?: string;
  cursor?: string;
  pageSize?: number;
}

export interface OrgGrantPage {
  items: OrgGrant[];
  nextCursor: string | null;
}

/** Org-wide management rows, newest first, as supplied by the backend. */
export async function getOrgGrants(
  params: GetOrgGrantsParams = {},
): Promise<OrgGrantPage> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.agentId) searchParams.set("agentId", params.agentId);
  if (params.vaultId) searchParams.set("vaultId", params.vaultId);
  if (params.entryId) searchParams.set("entryId", params.entryId);
  if (params.query) searchParams.set("query", params.query);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));

  const page = await api.get("api/grants", { searchParams }).json<OrgGrantPage>();
  return {
    ...page,
    nextCursor: page.nextCursor ?? null,
    items: page.items.map((grant) => {
      // Crypto decoding cannot decide whether a management row exists. A bad
      // reason is unavailable; signature/scope verification still precedes use.
    const reason = encryptedReasonEnvelopeSchema.safeParse(grant.encryptedReason)
      return {
        ...grant,
        entryScopes: grant.entryScopes ?? [],
        scriptScopes: grant.scriptScopes ?? [],
        canRevoke: grant.canRevoke ?? false,
        canGrantAgain: grant.canGrantAgain ?? false,
        activeCoveringGrantIds: grant.activeCoveringGrantIds ?? [],
        encryptedReason: reason.success ? reason.data : null,
    }
    }),
  };
}

/** A vault's active FULL grant, reduced to what a re-wrap needs. */
/** Revoke an active grant (optional reason, max 500 chars). */
export async function revokeGrant(
  vaultId: string,
  grantId: string,
  reason?: string,
): Promise<void> {
  const trimmed = reason?.trim();
  await api.delete(`api/vaults/${vaultId}/grants/${grantId}`, {
    json: trimmed ? { reason: trimmed } : {},
  });
}

/**
 * Create APIs intentionally expose separate contracts and routes: a granular
 * Entry envelope, a full-Vault key wrapper, and a complete Script package
 * cannot be confused at either the TypeScript or HTTP boundary.
 */
interface CreateGrantPolicyBody {
  grantId: string;
  agentId: string;
  expiresAt?: string;
  queryLimit?: number;
  methods?: string;
}

export interface CreateGranularGrantBody extends CreateGrantPolicyBody {
  fieldSelectionMode?: GrantFieldSelectionMode;
  grantEntry: Awaited<ReturnType<typeof buildCanonicalGrantEnvelope>>;
}

export interface CreateFullGrantBody extends CreateGrantPolicyBody {
  agentWrappedVaultKey: AgentWrappedVaultKeyContract;
}

export interface CreateScriptExecutionGrantBody extends CreateGrantPolicyBody {
  scriptPackage: ScriptExecutionEncryptedPackageV1;
}

export async function createGranularGrant(
  vaultId: string,
  entryId: string,
  body: CreateGranularGrantBody,
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/entries/${entryId}/grants`, { json: body })
  .json<{ id: string }>()
}

export async function createFullGrant(
  vaultId: string,
  body: CreateFullGrantBody,
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/full-grants`, { json: body })
  .json<{ id: string }>()
}

export async function createScriptExecutionGrant(
  vaultId: string,
  scriptEntryId: string,
  body: CreateScriptExecutionGrantBody,
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/scripts/${scriptEntryId}/grants`, { json: body })
  .json<{ id: string }>()
}
