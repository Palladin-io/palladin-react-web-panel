/**
 * Domain types for the Vault feature.
 *
 * Grant modes are stored as numeric enum values to mirror the backend
 * contract — the API serialises C# enums as integers, and we keep the
 * same shape on the wire to avoid lossy string conversions.
 */

import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  normalizeEntryType,
  type EntryType,
} from '../../shared/types/entry-type'
import type { ScriptExecutionMetadataV1 } from '../../shared/crypto/script-execution'

export {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  normalizeEntryType,
  type EntryType,
}

export const GRANT_MODE_FULL = 1 as const
export const GRANT_MODE_GRANULAR = 2 as const
export type GrantMode = typeof GRANT_MODE_FULL | typeof GRANT_MODE_GRANULAR

/**
 * Bitwise permission flags from the backend Permission enum. The auth
 * store exposes a numeric `permissions` value — components AND it with
 * these constants to gate Pro-only UI affordances.
 */
export const PERMISSION_MULTIPLE_VAULTS = 256
export const PERMISSION_FULL_GRANT_MODE = 512

export interface VaultSummary {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  grantMode: GrantMode
  createdAt: string
  updatedAt: string
  entryCount: number
  activeGrantCount: number
  memberCount: number
}

export interface Vault extends VaultSummary {
  organizationId: string
  /**
   * The caller's wrapped Vault Key (sealed-box ciphertext) returned from
   * `GET /vaults/{id}`. Optional because older backend builds and bare
   * mocks may omit it; consumers must guard before unwrapping.
   *
   * Base64-encoded `crypto_box_seal(VK, userPublicKey)`.
   */
  wrappedVK?: string
}

/**
 * Entry types match the backend `EntryType` enum — serialised as integers
 * on the wire. KEY (0) is a single secret value (API key, token, env
 * variable); CREDENTIAL (1) is a username + password pair, optionally
 * with a URL; SCRIPT (2) is an agent-run script with declared vault-data refs.
 */
/**
 * Encrypted-blob schema version. Its absence means v1 (well-known fields only,
 * no `fields[]`). v2 is additive — well-known fields stay top-level and custom
 * `fields[]` sit alongside them. Clients only stamp `v: 2` when the blob
 * actually carries v2 content (custom fields, or a SCRIPT entry) so existing
 * KEY/CREDENTIAL blobs stay byte-identical and older clients keep reading them.
 */
export const BLOB_VERSION_V2 = 2 as const

/**
 * Custom-field kinds a client renders. `text` = single line, `multiline` = a
 * growing monospace block (notes/config), `concealed` = masked secret, `totp` =
 * one-time-code seed. Unknown values are tolerated on read (forward-compat).
 */
export type CustomFieldType = 'text' | 'multiline' | 'concealed' | 'totp'

/**
 * Parsed TOTP seed. Stored as the `value` of a `totp` custom field (never the
 * raw `otpauth://` URI) so the code can be generated without re-parsing. The
 * backend never sees this — it lives inside the encrypted blob.
 */
export interface TotpParams {
  /** Base32 (RFC 4648) shared secret, no spaces/padding. */
  secret: string
  algorithm: 'SHA1' | 'SHA256' | 'SHA512'
  digits: number
  period: number
  issuer?: string
  account?: string
}

/**
 * A user-defined field carried in the encrypted blob's `fields[]` (v2). `id` is
 * a client-generated uuid, stable across edits (drives reorder/remove keys and
 * agent field-id addressing). `type` is left as a string so unknown future
 * types round-trip without throwing; renderers switch on the known values and
 * ignore the rest. For `totp` fields `value` is a {@link TotpParams} object; for
 * `text`/`concealed` it is a plain string.
 */
export interface CustomField {
  id: string
  label: string
  type: string
  value: string | TotpParams
  /**
   * When true, the owner marked this field as plaintext discovery metadata
   * (like Label/Description) — mirrored to `agentFields` on the entry so org
   * agents see it without a grant. Only valid for `text`/`multiline`;
   * never `concealed`/`totp`. Absent/false = private (default).
   */
  agentVisible?: boolean
}

export function isKnownFieldType(type: string): type is CustomFieldType {
  return type === 'text' || type === 'multiline' || type === 'concealed' || type === 'totp'
}

/** Only non-secret text-ish fields may be exposed to agents as discovery metadata. */
export function canBeAgentVisible(type: string): boolean {
  return type === 'text' || type === 'multiline'
}

/** Narrow a custom field to a TOTP field (value is {@link TotpParams}). */
export function isTotpField(
  field: CustomField,
): field is CustomField & { value: TotpParams } {
  if (field.type !== 'totp' || typeof field.value !== 'object'
    || field.value === null || Array.isArray(field.value)) return false
  const value = field.value as unknown as Record<string, unknown>
  const optionalText = (candidate: unknown) => candidate === undefined || typeof candidate === 'string'
  const allowedKeys = new Set(['secret', 'algorithm', 'digits', 'period', 'issuer', 'account'])
  return Object.keys(value).every((key) => allowedKeys.has(key))
    && typeof value.secret === 'string'
    && /^[A-Z2-7]*$/.test(value.secret)
    && (value.algorithm === 'SHA1' || value.algorithm === 'SHA256' || value.algorithm === 'SHA512')
    && (value.digits === 6 || value.digits === 8)
    && typeof value.period === 'number'
    && Number.isInteger(value.period)
    && value.period >= 15
    && value.period <= 120
    && optionalText(value.issuer)
    && optionalText(value.account)
}

/** Interpreters an agent may run a SCRIPT entry under (validated, never arbitrary). */
export const SCRIPT_INTERPRETERS = ['bash', 'sh', 'node', 'python'] as const
export type ScriptInterpreter = (typeof SCRIPT_INTERPRETERS)[number]

/**
 * An explicit `ENV_NAME → (entry, field)` mapping declared on a SCRIPT entry.
 * The agent injects the referenced field's value as the named env var before
 * exec — there is no `{{...}}` substitution in the script body (v1 decision).
 */
export interface ScriptRef {
  env: string
  /**
   * Vault of the referenced entry. Optional for backward-compat: old blobs
   * omit it and the agent CLI defaults a missing `vaultId` to the script's own
   * vault. New refs are always written with it (same-vault today).
   */
  vaultId?: string
  entryId: string
  /** Well-known alias (`value`/`username`/`password`/`url`) or a custom-field label. */
  field: string
}

/**
 * List item shape returned by `GET /vaults/{id}/entries` — metadata only,
 * never the encrypted content. The content is fetched lazily on reveal
 * via `GET /vaults/{id}/entries/{eid}` so we don't ship every secret to
 * the browser the moment the tab opens.
 */
export interface EntryListItem {
  id: string
  label: string
  description?: string
  icon?: string
  color?: string
  type: EntryType
  username?: string
  urlDomain?: string
  createdAt: string
  updatedAt: string
  lastAccessedAt?: string
  accessCount: number
}

/**
 * Encrypted entry content stored as JSONB on the backend. The plaintext
 * type lives on the outer entry `type` field — clients use it to choose
 * the right schema when decrypting.
 */
export interface EntryContent {
  encryptedBlob: string
  nonce: string
}

/**
 * Full entry detail (single-entry GET). Adds the encrypted content
 * — everything the client needs to decrypt with VK and render the
 * plaintext payload in the reveal panel.
 */
export interface EntryDetail extends EntryListItem {
  content: EntryContent
}

/**
 * Wire payload for `POST /vaults/{id}/entries`. The plaintext entry
 * payload (serialised JSON of {@link EntryPlaintext}) is encrypted with
 * the vault key client-side before this object is built.
 */
/**
 * Plaintext mirror of an owner-marked agent-visible field. Sent
 * alongside the encrypted content so the backend can store it as discovery
 * metadata (like Label/Description) — never a secret.
 */
export interface AgentField {
  label: string
  value: string
}

export interface CreateEntryPayload {
  label: string
  description?: string
  icon?: string
  color?: string
  type: EntryType
  content: EntryContent
  urlDomain?: string
  agentFields?: AgentField[]
}

/**
 * Fields shared by every v2 plaintext. Absent `v` means a v1 blob (no custom
 * fields). Written only when the blob carries v2 content — see
 * {@link BLOB_VERSION_V2}.
 */
export interface EntryPlaintextV2Common {
  v?: typeof BLOB_VERSION_V2
  /** Ordered custom fields (v2+). Display order = array order. */
  fields?: CustomField[]
}

/**
 * Plaintext payload that gets encrypted into `EntryContent.encryptedBlob`.
 * Discriminated union so the encrypt/decrypt helpers can switch on
 * `type` without tripping over optional fields.
 */
export type EntryPlaintext =
  | (EntryPlaintextV2Common & { type: typeof ENTRY_TYPE_KEY; value: string; url?: string; notes?: string })
  | (EntryPlaintextV2Common & {
      type: typeof ENTRY_TYPE_CREDENTIAL
      username: string
      password: string
      url?: string
      notes?: string
      /**
       * Full `otpauth://` URI for the entry's TOTP seed. Opaque to the
       * backend (it only ever sees the encrypted blob) — persisted inside
       * the plaintext JSON so import/export can round-trip 2FA seeds. UI that
       * predates this field simply ignores it.
       */
      totp?: string
    })
  | (EntryPlaintextV2Common & {
      type: typeof ENTRY_TYPE_SCRIPT
      /** Script body — plain text, run verbatim by the agent under `interpreter`. */
      script: string
      interpreter: ScriptInterpreter
      /** Agent-visible execution contract; absent on legacy Scripts and therefore result-withheld. */
      execution?: ScriptExecutionMetadataV1
      notes?: string
      /** Declared env-var → vault-field mappings injected at exec time. */
      refs?: ScriptRef[]
    })
  | (EntryPlaintextV2Common & {
      type: typeof ENTRY_TYPE_CREDIT_CARD
      cardholderName: string
      cardNumber: string
      cvv?: string
      expiryMonth: string
      expiryYear: string
      billingAddress?: string
      notes?: string
    })

export interface CreateVaultInput {
  name: string
  description?: string
  icon?: string
  color?: string
}

export interface UpdateVaultInput {
  name?: string
  description?: string
  icon?: string
  color?: string
  grantMode?: GrantMode
}
