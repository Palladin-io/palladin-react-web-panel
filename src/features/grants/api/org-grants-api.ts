import { z } from "zod";
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

export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const GRANT_TYPE_FULL = "full" as const;
export const GRANT_TYPE_GRANULAR = "granular" as const;
export const GRANT_TYPE_SCRIPT_EXECUTION = "scriptExecution" as const;
export type GrantType = typeof GRANT_TYPE_FULL | typeof GRANT_TYPE_GRANULAR
  | typeof GRANT_TYPE_SCRIPT_EXECUTION;

/**
 * Org-wide grant row from `GET /api/grants` (enriched `GrantResponse`). No
 * ciphertext (reEncryptedBlob/nonce/agentWrappedDek) is ever returned —
 * `agentPublicKey` IS returned because the client needs it to wrap a DEK when
 * re-granting. Fields the backend may not yet populate are nullable/optional so
 * the UI degrades gracefully.
 */
const orgGrantSchema = z.object({
  id: z.string(),
  vaultId: z.string(),
  vaultName: z.string().nullable().optional(),
  agentId: z.string().nullable().optional(),
  agentAccessEpoch: z.number().int().positive().max(0xffffffff).nullable().optional(),
  agentName: z.string().nullable().optional(),
  // Agent's chosen icon — a Material glyph name or an uploaded S3 URL. Lets the
  // panel render the agent's real avatar instead of a generic robot. Optional
  // until the backend (GrantResponse) ships it; AgentAvatar falls back to
  // initials/deterministic colour when absent.
  agentIconKey: z.string().nullable().optional(),
  agentPublicKey: z.string().nullable().optional(),
  recipientAgentKeyVersion: z
    .number()
    .int()
    .positive()
    .max(0xffffffff)
    .nullable()
    .optional(),
  agentSigningPublicKey: z.string().nullable().optional(),
  agentSigningKeyVersion: z
    .number()
    .int()
    .positive()
    .max(0xffffffff)
    .nullable()
    .optional(),
  agentSigningKeyFingerprint: z.string().nullable().optional(),
  type: z.enum([GRANT_TYPE_FULL, GRANT_TYPE_GRANULAR, GRANT_TYPE_SCRIPT_EXECUTION]),
  status: z.enum(GRANT_STATUSES),
  // Combined-flags string of permitted methods, e.g. "get, exec". Optional for
  // pre-methods backends; the badge is hidden when absent/empty.
  methods: z.string().nullable().optional(),
  entryId: z.string().nullable().optional(),
  scriptEntryId: z.string().nullable().optional(),
  entryLabel: z.string().nullable().optional(),
  entryScopes: z
    .array(
      z
        .object({
          entryId: z.string(),
          fieldIds: z.array(z.string()),
          grantEnvelopeRevision: z.string().nullable(),
          entryRevision: z.string().nullable(),
          grantKeyVersion: z.number().int().positive().nullable(),
          memberKeyGeneration: z.number().int().positive().nullable(),
          recipientAgentKeyVersion: z.number().int().positive().nullable(),
          agentKeyFingerprint: z.string().nullable(),
        })
        .strict(),
    )
    .optional()
    .default([]),
  scriptScopes: z.array(z.object({
    entryId: z.string(),
    entryRevision: z.string(),
    isScript: z.boolean(),
  }).strict()).optional().default([]),
  scriptPackageRevision: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  encryptedReason: encryptedReasonEnvelopeSchema.nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  queryLimit: z.number().nullable().optional(),
  queryCount: z.number().nullable().optional(),
  expirySource: z.string().nullable().optional(),
  createdAt: z.string(),
  createdBy: z.string().uuid().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  revokedBy: z.string().uuid().nullable().optional(),
  revokedByName: z.string().nullable().optional(),
  supersededAt: z.string().nullable().optional(),
  supersededByGrantId: z.string().uuid().nullable().optional(),
  deniedBy: z.string().uuid().nullable().optional(),
  deniedByName: z.string().nullable().optional(),
  revokeReason: z.string().nullable().optional(),
  denyReason: z.string().nullable().optional(),
  lastAccessedAt: z.string().nullable().optional(),
  lastAccessIp: z.string().nullable().optional(),
  lastAccessHostname: z.string().nullable().optional(),
  // Per-grant action availability computed by the backend — the UI renders
  // actions strictly from these flags, never inferring from status itself.
  // Optional with a `false` fallback until the backend ships them, so no action
  // is wrongly shown before the contract lands.
  canRevoke: z.boolean().optional().default(false),
  canGrantAgain: z.boolean().optional().default(false),
  activeCoveringGrantIds: z.array(z.string().uuid()).optional().default([]),
});

export type OrgGrant = z.infer<typeof orgGrantSchema>;

const orgGrantPageSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional(),
});

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

/**
 * Org-wide grants list, newest-first. Each item is parsed individually with
 * `safeParse` so one malformed row never collapses the whole list.
 */
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

  const raw = await api.get("api/grants", { searchParams }).json();
  const page = orgGrantPageSchema.parse(raw);

  const items: OrgGrant[] = [];
  let skipped = 0;
  for (const item of page.items) {
    const result = orgGrantSchema.safeParse(item);
    if (result.success) items.push(result.data);
    else skipped += 1;
  }
  if (skipped > 0) {
    console.warn(`[org-grants] skipped ${skipped} malformed item(s)`);
  }
  return { items, nextCursor: page.nextCursor ?? null };
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
    .json<{ id: string }>();
}

export async function createFullGrant(
  vaultId: string,
  body: CreateFullGrantBody,
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/full-grants`, { json: body })
    .json<{ id: string }>();
}

export async function createScriptExecutionGrant(
  vaultId: string,
  scriptEntryId: string,
  body: CreateScriptExecutionGrantBody,
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/scripts/${scriptEntryId}/grants`, { json: body })
    .json<{ id: string }>();
}
