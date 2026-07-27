import { api } from '../../../shared/api/client'
import type { CreateVaultProtocolPayload } from '../../../shared/crypto/create-vault-protocol'
import { openVaultProjection, type EncryptedVaultProjection } from '../../../shared/crypto/vault-protocol'
import { deriveVaultSubkey } from '../../../shared/crypto/hkdf'
import { assertEnvelopeScope, openVaultEnvelope, toEnvelopeDescriptor, type VaultEnvelopeContract } from '../../../shared/crypto/vault-envelope'
import { ENVELOPE_PURPOSE } from '../../../shared/crypto/envelope'
import { wipe } from '../../../shared/crypto/sodium'
import type { VaultKeyBinding } from '../../../shared/crypto/entry-protocol'
import { openMemberIndex, openMemberSecret, type EmptyBinding, type MemberSecretBinding } from '../../../shared/crypto/entry-protocol'
import { normalizeEntryType } from '../types'
import type {
  EntryDetail,
  EntryListItem,
  GrantMode,
  Vault,
  VaultSummary,
} from '../types'

export interface VaultListResponse {
  vaults: VaultSummary[]
  total?: number
}

/**
 * Server-side payload for vault creation. Mirrors {@link CreateVaultInput}
 * but adds the wrapped Vault Key — produced client-side by sealing a fresh
 * 32-byte VK to the user's X25519 public key. The server never sees the
 * raw VK; it just stores the wrapped blob alongside the metadata.
 */
export type CreateVaultPayload = CreateVaultProtocolPayload

export interface VaultCreationChallenge { vaultId: string; expiresAt: string }

export function issueVaultCreationChallenge(): Promise<VaultCreationChallenge> {
  return api.post('api/vaults/creation-challenges').json<VaultCreationChallenge>()
}

interface EncryptedVaultSummary extends EncryptedVaultProjection {
  isDefault: boolean
  createdAt: string
  updatedAt: string
  memberCount: number
  entryCount: number
  activeGrantCount: number
  discoveryKey?: VaultEnvelopeContract<VaultKeyBinding>
  currentKeyEpoch: Vault['currentKeyEpoch']
  vaultPrivateKeys?: Vault['vaultPrivateKeys']
}

interface VaultKeySink { vaultKey(id: string, key: Uint8Array): void; discoveryKey(id: string, key: Uint8Array): void }

async function openVaultSummary(encrypted: EncryptedVaultSummary, privateKey: Uint8Array, memberId: string, sink: VaultKeySink): Promise<Vault> {
  const opened = await openVaultProjection(encrypted, privateKey, memberId)
  sink.vaultKey(encrypted.id, opened.vaultKey)
  if (encrypted.discoveryKey) {
    assertEnvelopeScope(encrypted.discoveryKey.descriptor, {
      purpose: ENVELOPE_PURPOSE.vaultDiscoveryKeyByVk,
      organizationId: encrypted.organizationId,
      vaultId: encrypted.id,
    })
    if (encrypted.discoveryKey.descriptor.memberKeyGeneration !== encrypted.memberKeyGeneration) {
      throw new Error('Vault Discovery-key envelope does not match the outer Vault generation')
    }
    const descriptor = toEnvelopeDescriptor(encrypted.discoveryKey.descriptor)
    const wrappingKey = await deriveVaultSubkey(opened.vaultKey, {
      protocolVersion: descriptor.protocolVersion, cryptoSuiteId: descriptor.cryptoSuiteId,
      purpose: descriptor.purpose, organizationId: descriptor.organizationId, vaultId: descriptor.vaultId,
      keyVersion: descriptor.keyVersion, memberKeyGeneration: descriptor.memberKeyGeneration,
    })
    try {
      const vdk = await openVaultEnvelope(encrypted.discoveryKey, wrappingKey, {
        wrappingVkVersion: encrypted.discoveryKey.descriptor.binding.wrappingVaultKeyVersion,
      })
      try { sink.discoveryKey(encrypted.id, vdk) } finally { wipe(vdk) }
    } finally { wipe(wrappingKey) }
  }
  opened.vaultKey.fill(0)
  return {
    id: encrypted.id, organizationId: encrypted.organizationId,
    isDefault: encrypted.isDefault, memberKeyGeneration: encrypted.memberKeyGeneration,
    memberVaultMetadata: encrypted.memberVaultMetadata, memberVaultKey: encrypted.memberVaultKey,
    currentKeyEpoch: encrypted.currentKeyEpoch,
    vaultPrivateKeys: encrypted.vaultPrivateKeys ?? [],
    name: opened.metadata.name, description: opened.metadata.description,
    icon: opened.metadata.icon?.kind === 'glyph' ? opened.metadata.icon.value : null,
    color: opened.metadata.color, grantMode: opened.metadata.grantMode === 'full' ? 1 : 2,
    createdAt: encrypted.createdAt, updatedAt: encrypted.updatedAt,
    entryCount: encrypted.entryCount, activeGrantCount: encrypted.activeGrantCount,
    memberCount: encrypted.memberCount,
  }
}

export async function getVaults(privateKey: Uint8Array, memberId: string, sink: VaultKeySink): Promise<VaultListResponse> {
  const response = await api.get('api/vaults').json<{ vaults: EncryptedVaultSummary[]; total: number }>()
  return { vaults: await Promise.all(response.vaults.map((vault) => openVaultSummary(vault, privateKey, memberId, sink))), total: response.total }
}

export async function getVault(id: string, privateKey: Uint8Array, memberId: string, sink: VaultKeySink): Promise<Vault> {
  return openVaultSummary(await api.get(`api/vaults/${id}`).json<EncryptedVaultSummary>(), privateKey, memberId, sink)
}

export function createVault(payload: CreateVaultPayload): Promise<{ id: string }> {
  return api.post('api/vaults', { json: payload }).json<{ id: string }>()
}

/**
 * PATCH-style update — only fields present in `payload` are changed.
 * Backend returns 204 No Content on success, so we resolve to void.
 */
export async function updateVault(
  id: string,
  memberVaultMetadata: EncryptedVaultProjection['memberVaultMetadata'],
): Promise<void> {
  await api.put(`api/vaults/${id}`, { json: { memberVaultMetadata } })
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
  vaultKey: Uint8Array,
  cursor?: string,
): Promise<EntryListResponse> {
  const response = await api
    .get(`api/vaults/${vaultId}/entries`, {
      searchParams: cursor ? { cursor } : undefined,
    })
    .json<{ items: Array<{ id: string; currentRevision: string; memberIndexRevision: string; createdAt: string; updatedAt: string; memberIndex: VaultEnvelopeContract<EmptyBinding> }>; nextCursor?: string }>()
  return {
    nextCursor: response.nextCursor,
    items: await Promise.all(response.items.map(async (item) => {
      const index = await openMemberIndex(item.memberIndex, vaultKey, {
        organizationId: item.memberIndex.descriptor.scope.organizationId,
        vaultId,
        entryId: item.id,
        revision: item.memberIndexRevision,
      })
      return {
        id: item.id, label: index.memberLabel, description: index.description ?? undefined,
        icon: index.icon?.kind === 'glyph' ? index.icon.value : undefined, color: index.color ?? undefined,
        type: normalizeEntryType(index.entryType), urlDomain: index.urlDomain ?? undefined,
        createdAt: item.createdAt, updatedAt: item.updatedAt, accessCount: 0,
      }
    })),
  }
}

/**
 * Fetch EVERY entry of a vault by following the cursor to the last page. Use
 * this when the caller needs the complete set — bulk export and import
 * conflict-detection — rather than {@link getEntries}, which returns only the
 * first page and would silently miss entries in vaults larger than one page.
 */
export async function getAllEntries(vaultId: string, vaultKey: Uint8Array): Promise<EntryListItem[]> {
  const all: EntryListItem[] = []
  let cursor: string | undefined
  do {
    const page = await getEntries(vaultId, vaultKey, cursor)
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

export async function getEntry(
  vaultId: string,
  entryId: string,
  vaultKey: Uint8Array,
): Promise<EntryDetail> {
  const entry = await api
    .get(`api/vaults/${vaultId}/entries/${entryId}`)
    .json<{ organizationId: string; vaultId: string; id: string; currentRevision: string; createdAt: string; updatedAt: string; memberSecret: VaultEnvelopeContract<MemberSecretBinding>; entryKey: VaultEnvelopeContract<VaultKeyBinding> }>()
  if (entry.vaultId !== vaultId || entry.id !== entryId) {
    throw new Error('Entry response does not match the requested resource')
  }
  const secret = await openMemberSecret(entry.entryKey, entry.memberSecret, vaultKey, {
    organizationId: entry.organizationId,
    vaultId,
    entryId,
    revision: entry.currentRevision,
  })
  const plaintext = memberSecretToLegacy(secret)
  return {
    id: entry.id, label: secret.memberLabel, description: secret.description ?? undefined,
    icon: secret.icon?.kind === 'glyph' ? secret.icon.value : undefined, color: secret.color ?? undefined,
    type: normalizeEntryType(secret.entryType),
    urlDomain: secret.entryType === 'credential' ? secret.content.urlDomain ?? undefined : undefined,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt, accessCount: 0, plaintext,
    currentRevision: entry.currentRevision, memberSecretModel: secret,
  }
}

function memberSecretToLegacy(secret: import('../../../shared/crypto/vault-plaintext').MemberSecretV1): import('../types').EntryPlaintext {
  const fields = secret.content.customFields.map((field) => ({ id: field.id.replace(/^custom:/, ''), label: field.label, type: field.type, value: field.value as string }))
  if (secret.entryType === 'key') return { type: 0, value: secret.content.value, notes: secret.content.notes ?? undefined, fields }
  if (secret.entryType === 'credential') return { type: 1, username: secret.content.username, password: secret.content.password, url: secret.content.url ?? undefined, notes: secret.content.notes ?? undefined, fields }
  return { type: 2, script: secret.content.source, interpreter: secret.content.interpreter, notes: secret.content.notes ?? undefined,
    refs: secret.content.refs.map((ref) => ({ env: ref.env, vaultId: ref.vaultId, entryId: ref.entryId, field: ref.fieldId })), fields }
}

export function createEntry(
  vaultId: string,
  payload: import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes & { entryId: string; grantEnvelopes: unknown[] },
): Promise<{ id: string }> {
  return api
    .post(`api/vaults/${vaultId}/entries`, { json: payload })
    .json<{ id: string }>()
}

export function issueEntryCreationChallenge(vaultId: string, count = 1): Promise<{ items: { entryId: string; expiresAt: string }[] }> {
  return api.post(`api/vaults/${vaultId}/entries/creation-challenges`, { json: { count } })
    .json<{ items: { entryId: string; expiresAt: string }[] }>()
}

export async function updateEntry(
  vaultId: string,
  entryId: string,
  payload: Omit<import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes, 'entryKey'> & {
    baseRevision: string
    newEntryKey: import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes['entryKey']
    agentDiscoveryChanged: boolean
    grantEnvelopes: unknown[]
  },
): Promise<{ currentRevision: string }> {
  return api.put(`api/vaults/${vaultId}/entries/${entryId}`, { json: payload }).json<{ currentRevision: string }>()
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
  entryId: string
  entryKey: import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes['entryKey']
  memberIndex: import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes['memberIndex']
  memberSecret: import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes['memberSecret']
  agentDiscovery: import('../../../shared/crypto/entry-protocol').CanonicalEntryEnvelopes['agentDiscovery']
  grantEnvelopes: unknown[]
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
  void domain
  return null
}

// Re-export for convenient consumption by hooks/tests.
export type { GrantMode }

export interface FaviconHit {
  domain: string
  iconUrl: string
}

/** Search the shared favicon index (brand icons section of the icon browser). */
export async function searchFavicons(query: string): Promise<FaviconHit[]> {
  void query
  return []
}
