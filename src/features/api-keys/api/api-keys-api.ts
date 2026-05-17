import { api } from '../../../shared/api/client'

export type ApiKeyStatus = 'active' | 'revoked'

export interface ApiKeySummary {
  apiKeyId: string
  name: string
  status: ApiKeyStatus
  createdAt: string
  revokedAt?: string | null
}

export interface GeneratedApiKey {
  apiKeyId: string
  name: string
  plaintext: string
  createdAt: string
}

export function getApiKeys(): Promise<ApiKeySummary[]> {
  return api
    .get('api/api-keys')
    .json<{ items: ApiKeySummary[] }>()
    .then((r) => r.items)
}

export async function generateApiKey(name: string): Promise<GeneratedApiKey> {
  return api.post('api/api-keys', { json: { name } }).json<GeneratedApiKey>()
}

/** Revokes an API key. The endpoint is idempotent and returns 204. */
export async function revokeApiKey(keyId: string): Promise<void> {
  await api.delete(`api/api-keys/${keyId}`)
}
