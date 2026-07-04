import { api } from '../../../shared/api/client'
import type { GrantEntryEnvelope } from '../../../shared/crypto/grant-envelope'
import { normalizeEntryType } from '../types'
import type {
  CreateEntryPayload,
  CreateVaultInput,
  EntryContent,
  EntryDetail,
  EntryListItem,
  EntryType,
  GrantMode,
  UpdateVaultInput,
  Vault,
  VaultSummary,
} from '../types'

export interface VaultListResponse {
  vaults: VaultSummary[]
}

/**
 * Server-side payload for vault creation. Mirrors {@link CreateVaultInput}
 * but adds the wrapped Vault Key — produced client-side by sealing a fresh
 * 32-byte VK to the user's X25519 public key. The server never sees the
 * raw VK; it just stores the wrapped blob alongside the metadata.
 */
export interface CreateVaultPayload extends CreateVaultInput {
  /** base64-encoded sealed-box ciphertext: `crypto_box_seal(VK, userPubKey)`. */
  wrappedVK: string
}

export function getVaults(): Promise<VaultListResponse> {
  return api.get('api/vaults').json<VaultListResponse>()
}

export function getVault(id: string): Promise<Vault> {
  return api.get(`api/vaults/${id}`).json<Vault>()
}

export function createVault(payload: CreateVaultPayload): Promise<Vault> {
  return api.post('api/vaults', { json: payload }).json<Vault>()
}

/**
 * PATCH-style update — only fields present in `payload` are changed.
 * Backend returns 204 No Content on success, so we resolve to void.
 */
export async function updateVault(
  id: string,
  payload: UpdateVaultInput,
): Promise<void> {
  await api.put(`api/vaults/${id}`, { json: payload })
}

export async function deleteVault(id: string): Promise<void> {
  await api.delete(`api/vaults/${id}`)
}

export interface PresignResponse {
  uploadUrl: string
  publicUrl: string
  expiresAt: string
}

export function presignVaultIcon(
  vaultId: string,
  extension: string,
): Promise<PresignResponse> {
  return api
    .post(`api/vaults/${vaultId}/icon/presign`, { json: { vaultId, extension } })
    .json<PresignResponse>()
}

export async function uploadToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) throw new Error(`S3 upload failed: ${response.status}`)
}

/**
 * Cursor-paginated entries listing. The list intentionally omits the
 * encrypted blob and nonce — those are fetched lazily on reveal via
 * {@link getEntry} to keep the payload small and reduce the surface
 * where secret bytes are present in browser memory.
 */
export interface EntryListResponse {
  items: EntryListItem[]
  nextCursor?: string
}

export async function getEntries(
  vaultId: string,
  cursor?: string,
): Promise<EntryListResponse> {
  const response = await api
    .get(`api/vaults/${vaultId}/entries`, {
      searchParams: cursor ? { cursor } : undefined,
    })
    .json<EntryListResponse>()
  // The backend serialises `type` as a string ("key"/"credential"); normalise
  // it to the numeric EntryType every consumer compares against.
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      type: normalizeEntryType(item.type),
    })),
  }
}

/**
 * Fetch EVERY entry of a vault by following the cursor to the last page. Use
 * this when the caller needs the complete set — bulk export and import
 * conflict-detection — rather than {@link getEntries}, which returns only the
 * first page and would silently miss entries in vaults larger than one page.
 */
export async function getAllEntries(vaultId: string): Promise<EntryListItem[]> {
  const all: EntryListItem[] = []
  let cursor: string | undefined
  do {
    const page = await getEntries(vaultId, cursor)
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

export async function getEntry(
  vaultId: string,
  entryId: string,
): Promise<EntryDetail> {
  const entry = await api
    .get(`api/vaults/${vaultId}/entries/${entryId}`)
    .json<EntryDetail>()
  return { ...entry, type: normalizeEntryType(entry.type) }
}

export function createEntry(
  vaultId: string,
  payload: CreateEntryPayload,
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/entries`, { json: payload })
    .json<{ id: string }>()
}

export async function updateEntry(
  vaultId: string,
  entryId: string,
  payload: {
    label?: string
    description?: string
    icon?: string
    color?: string
    urlDomain?: string
    content?: EntryContent
  },
): Promise<void> {
  await api.put(`api/vaults/${vaultId}/entries/${entryId}`, { json: payload })
}

export async function deleteEntry(
  vaultId: string,
  entryId: string,
): Promise<void> {
  await api.delete(`api/vaults/${vaultId}/entries/${entryId}`)
}

export function presignEntryIcon(
  vaultId: string,
  entryId: string,
  extension: string,
): Promise<PresignResponse> {
  return api
    .post(`api/vaults/${vaultId}/entries/${entryId}/icon/presign`, { json: { extension } })
    .json<PresignResponse>()
}

/**
 * One entry in a bulk import request — a single create-entry payload plus the
 * `grantEntries` re-wrap material. The backend requires exactly one entry here
 * per ACTIVE FULL grant on the vault (empty when none): each carries the new
 * entry's plaintext re-encrypted under a fresh DEK sealed to that grant's agent,
 * keyed by `grantId`. The client encrypts against the vault key before building
 * this.
 */
export interface ImportEntryItem {
  label: string
  description?: string
  icon?: string
  type: EntryType
  content: EntryContent
  urlDomain?: string
  grantEntries: ({ grantId: string } & GrantEntryEnvelope)[]
}

export interface ImportEntriesBody {
  format: string
  entries: ImportEntryItem[]
}

export interface ImportEntriesResponse {
  importedCount: number
  entryIds: string[]
}

/**
 * Bulk-create encrypted entries. The backend caps a single request at 500
 * items; callers chunk larger imports and sum the responses.
 *
 * A 2xx response with an empty body is treated as success (imported count =
 * items sent). This guards the "data saved but the wizard shows an error" case:
 * `.json()` throws on an empty body, which would fire the mutation's `onError`
 * even though every entry was persisted.
 */
export async function importEntries(
  vaultId: string,
  body: ImportEntriesBody,
): Promise<ImportEntriesResponse> {
  const response = await api.post(`api/vaults/${vaultId}/entries/import`, {
    json: body,
  })
  const text = await response.text()
  if (!text.trim()) {
    return { importedCount: body.entries.length, entryIds: [] }
  }
  return JSON.parse(text) as ImportEntriesResponse
}

/**
 * Record that a plaintext export happened. Fire-and-forget from the UI — a
 * failed audit write must never block the user's download.
 */
export async function exportAudit(
  vaultId: string,
  body: { format: string; entryCount: number },
): Promise<void> {
  await api.post(`api/vaults/${vaultId}/export-audit`, { json: body })
}

/**
 * Shared per-domain favicon from the public cache (fetched server-side on a
 * miss). Null = no suggestion; never throws into the form flow.
 */
export async function resolveFavicon(domain: string): Promise<string | null> {
  try {
    const res = await api
      .get('api/vaults/favicons/resolve', { searchParams: { domain } })
      .json<{ iconUrl: string | null }>()
    return res.iconUrl
  } catch {
    return null
  }
}

// Re-export for convenient consumption by hooks/tests.
export type { GrantMode }
