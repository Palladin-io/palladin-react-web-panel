/**
 * Domain types for the Vault feature.
 *
 * Grant modes are stored as numeric enum values to mirror the backend
 * contract — the API serialises C# enums as integers, and we keep the
 * same shape on the wire to avoid lossy string conversions.
 */

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
 * with a URL.
 */
export const ENTRY_TYPE_KEY = 0 as const
export const ENTRY_TYPE_CREDENTIAL = 1 as const
export type EntryType = typeof ENTRY_TYPE_KEY | typeof ENTRY_TYPE_CREDENTIAL

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
  type: EntryType
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
export interface CreateEntryPayload {
  label: string
  description?: string
  icon?: string
  type: EntryType
  content: EntryContent
  urlDomain?: string
}

/**
 * Plaintext payload that gets encrypted into `EntryContent.encryptedBlob`.
 * Discriminated union so the encrypt/decrypt helpers can switch on
 * `type` without tripping over optional fields.
 */
export type EntryPlaintext =
  | { type: typeof ENTRY_TYPE_KEY; value: string; notes?: string }
  | {
      type: typeof ENTRY_TYPE_CREDENTIAL
      username: string
      password: string
      url?: string
      notes?: string
    }

export interface CreateVaultInput {
  name: string
  description?: string
  icon?: string
  color?: string
  grantMode: GrantMode
}

export interface UpdateVaultInput {
  name?: string
  description?: string
  icon?: string
  color?: string
  grantMode?: GrantMode
}
