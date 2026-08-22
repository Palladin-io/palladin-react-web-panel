import { z } from 'zod'
import { api, authenticatedRequestContext } from '../../../shared/api/client'
import type { AuthenticatedSessionSnapshot } from '../../auth/session/session-boundary'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import type { EncryptedAssetMediaType, EncryptedAssetTarget } from '../../../shared/crypto/vault-v2-assets'

const canonicalUuid = z.string().uuid().refine((value) => value === value.toLowerCase())
const metadataSchema = z.object({
  assetId: canonicalUuid,
  target: z.union([z.literal(1), z.literal(2)]),
  entryId: canonicalUuid.nullable(),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  ciphertextLength: z.number().int().positive().max(6 * 1024 * 1024),
  ciphertextSha256: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  downloadUrl: z.string().url().optional(),
}).strict()

export interface EncryptedAssetUpload {
  vaultId: string
  assetId: string
  target: EncryptedAssetTarget
  entryId?: string
  mediaType: EncryptedAssetMediaType
  ciphertext: Uint8Array
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)))
}

export async function uploadEncryptedAsset(
  input: EncryptedAssetUpload,
  session?: AuthenticatedSessionSnapshot,
): Promise<void> {
  const ciphertextSha256 = await sha256(input.ciphertext)
  await api.post(`api/vaults/${input.vaultId}/assets`, {
    json: {
      vaultId: input.vaultId,
      assetId: input.assetId,
      target: input.target,
      entryId: input.entryId ?? null,
      mediaType: input.mediaType,
      ciphertext: encodeBase64Url(input.ciphertext),
      ciphertextSha256,
    },
    ...(session ? authenticatedRequestContext(session) : {}),
  })
}

async function readBoundedCiphertext(response: Response, expectedLength: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw new Error('Encrypted asset download failed')
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) !== expectedLength) {
    await response.body.cancel().catch(() => undefined)
    throw new Error('Encrypted asset length mismatch')
  }
  const reader = response.body.getReader()
  const result = new Uint8Array(expectedLength)
  let offset = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (offset + value.length > expectedLength) throw new Error('Encrypted asset exceeds declared length')
      result.set(value, offset)
      offset += value.length
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
  if (offset !== expectedLength) throw new Error('Encrypted asset length mismatch')
  return result
}

export async function downloadEncryptedAsset(vaultId: string, assetId: string, signal?: AbortSignal): Promise<{
  ciphertext: Uint8Array
  mediaType: EncryptedAssetMediaType
  target: EncryptedAssetTarget
  entryId?: string
}> {
  const metadata = metadataSchema.parse(await api.get(`api/vaults/${vaultId}/assets/${assetId}`, { signal }).json())
  if (metadata.assetId !== assetId) throw new Error('Encrypted asset identifier mismatch')
  if (!metadata.downloadUrl) throw new Error('Encrypted asset download URL is missing')
  const url = new URL(metadata.downloadUrl)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Encrypted asset download URL must use HTTPS')
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
  const ciphertext = await readBoundedCiphertext(response, metadata.ciphertextLength)
  if (await sha256(ciphertext) !== metadata.ciphertextSha256) throw new Error('Encrypted asset digest mismatch')
  return {
    ciphertext,
    mediaType: metadata.mediaType,
    target: metadata.target,
    ...(metadata.entryId ? { entryId: metadata.entryId } : {}),
  }
}

export async function deleteEncryptedAsset(
  vaultId: string,
  assetId: string,
  session?: AuthenticatedSessionSnapshot,
): Promise<void> {
  await api.delete(
    `api/vaults/${vaultId}/assets/${assetId}`,
    session ? authenticatedRequestContext(session) : undefined,
  )
}
