import { api } from '../../../shared/api/client'

export type ApiKeyStatus = 'active' | 'revoked'

export interface ApiKeySummary {
  apiKeyId: string
  name: string
  keySuffix: string
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

// Backend may send status as a camelCase string ("active") or as an integer
// (1 = Active, 2 = Revoked) depending on whether the FastEndpoints serializer
// has the JsonStringEnumConverter applied. Normalise at the boundary.
function normalizeStatus(raw: unknown): ApiKeyStatus {
  if (raw === 'active' || raw === 1) return 'active'
  return 'revoked'
}

type RawApiKeySummary = Omit<ApiKeySummary, 'status' | 'keySuffix'> & {
  status: unknown
  keySuffix?: string | null
}

export function getApiKeys(): Promise<ApiKeySummary[]> {
  return api
    .get('api/api-keys')
    .json<{ items: RawApiKeySummary[] }>()
    .then((r) =>
      r.items.map((item) => ({
        ...item,
        keySuffix: item.keySuffix ?? '',
        status: normalizeStatus(item.status),
      })),
    )
}

export async function generateApiKey(name: string): Promise<GeneratedApiKey> {
  return api.post('api/api-keys', { json: { name } }).json<GeneratedApiKey>()
}

/** Revokes an API key. The endpoint is idempotent and returns 204. */
export async function revokeApiKey(keyId: string): Promise<void> {
  await api.delete(`api/api-keys/${keyId}`)
}
