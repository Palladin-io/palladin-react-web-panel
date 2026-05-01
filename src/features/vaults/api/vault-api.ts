import { api } from '../../../shared/api/client'
import type {
  CreateVaultInput,
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

// Re-export for convenient consumption by hooks/tests.
export type { GrantMode }
