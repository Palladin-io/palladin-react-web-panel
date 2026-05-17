import { z } from 'zod'
import { api } from '../../../shared/api/client'

/** Lifecycle status of an API key. Mirrors the backend enum. */
export const apiKeyStatusSchema = z.enum(['Active', 'Revoked'])
export type ApiKeyStatus = z.infer<typeof apiKeyStatusSchema>

/**
 * Summary shape returned by `GET /api/api-keys`. The plaintext secret is
 * NEVER part of this payload — it is only returned once at creation time
 * (see {@link generatedApiKeySchema}).
 */
export const apiKeySummarySchema = z.object({
  apiKeyId: z.string(),
  name: z.string(),
  status: apiKeyStatusSchema,
  createdAt: z.string(),
  revokedAt: z.string().optional(),
})

export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>

const apiKeyListSchema = z.object({
  items: z.array(apiKeySummarySchema),
})

/**
 * Response of `POST /api/api-keys`. `plaintext` is the full secret and is
 * returned exactly once — it must be surfaced to the user immediately and
 * never persisted client-side beyond the open modal.
 */
export const generatedApiKeySchema = z.object({
  apiKeyId: z.string(),
  name: z.string(),
  plaintext: z.string(),
  createdAt: z.string(),
})

export type GeneratedApiKey = z.infer<typeof generatedApiKeySchema>

export async function getApiKeys(): Promise<ApiKeySummary[]> {
  const data = await api.get('api/api-keys').json()
  return apiKeyListSchema.parse(data).items
}

export async function generateApiKey(name: string): Promise<GeneratedApiKey> {
  const data = await api.post('api/api-keys', { json: { name } }).json()
  return generatedApiKeySchema.parse(data)
}

/** Revokes an API key. The endpoint is idempotent and returns 204. */
export async function revokeApiKey(keyId: string): Promise<void> {
  await api.delete(`api/api-keys/${keyId}`)
}
