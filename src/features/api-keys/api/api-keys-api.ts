import { api } from '../../../shared/api/client'
import type { Agent } from '../../agents'

export type ApiKeyStatus = string

export interface ApiKeySummary {
  apiKeyId: string
  name: string
  keySuffix: string
  status: ApiKeyStatus
  createdAt: string
  createdByName: string
  revokedAt?: string | null
  revokedByName?: string | null
  /** Active agents whose most recent operation authenticated with this key. */
  activeAgentCount: number
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
export function normalizeApiKeyStatus(raw: unknown): ApiKeyStatus {
  if (raw === 'active' || raw === 1) return 'active'
  if (raw === 'revoked' || raw === 2) return 'revoked'
  return typeof raw === 'string' ? raw : 'unknown'
}

type RawApiKeySummary = Omit<ApiKeySummary, 'status' | 'keySuffix' | 'createdByName'> & {
  status: unknown
  keySuffix?: string | null
  createdByName?: string | null
}

export function getApiKeys(): Promise<ApiKeySummary[]> {
  return api
    .get('api/api-keys')
    .json<{ items: RawApiKeySummary[] }>()
    .then((r) =>
      r.items.map((item) => ({
        ...item,
        keySuffix: item.keySuffix ?? '',
        createdByName: item.createdByName ?? '',
        status: normalizeApiKeyStatus(item.status),
      })),
    )
}

export async function activateApiKey(keyId: string): Promise<void> {
  await api.post(`api/api-keys/${keyId}/activate`)
}

export async function deleteApiKey(keyId: string): Promise<void> {
  await api.delete(`api/api-keys/${keyId}/permanent`)
}

export async function generateApiKey(name: string): Promise<GeneratedApiKey> {
  return api.post('api/api-keys', { json: { name } }).json<GeneratedApiKey>()
}

/** Revokes an API key. The endpoint is idempotent and returns 204. */
export async function revokeApiKey(keyId: string): Promise<void> {
  await api.delete(`api/api-keys/${keyId}`)
}

export interface ApiKeyAgentsPage {
  items: Agent[]
  nextCursor: string | null
}

/**
 * Cursor-paginated list of agents whose most recent operation authenticated
 * with this API key. Same item shape as the main agents list.
 */
export async function getApiKeyAgents(
  apiKeyId: string,
  cursor?: string,
): Promise<ApiKeyAgentsPage> {
  return api
    .get(`api/api-keys/${apiKeyId}/agents`, {
      searchParams: cursor ? { cursor } : undefined,
    })
    .json<ApiKeyAgentsPage>()
}
