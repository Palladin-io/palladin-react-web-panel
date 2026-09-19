import { api } from '../../shared/api/client'

/** Push token platform discriminator — must match the backend enum. */
export const PUSH_PLATFORM_WEB = 'Web' as const

export interface RegisterPushTokenInput {
  token: string
  platform: typeof PUSH_PLATFORM_WEB
  deviceName?: string
}

export interface PushToken {
  id: string
  platform: string
  deviceName?: string | null
  createdAt?: string
}

/** Register an FCM-for-Web token. Returns the server-assigned token id. */
export async function registerPushToken(
  input: RegisterPushTokenInput,
): Promise<string> {
  const raw = await api.post('api/push-tokens', { json: input }).json<{ id: string }>()
  return raw.id
}

export async function deletePushToken(id: string): Promise<void> {
  await api.delete(`api/push-tokens/${id}`)
}

export async function listPushTokens(): Promise<PushToken[]> {
  const raw = await api.get('api/push-tokens').json<{ items: PushToken[] }>()
  return raw.items
}
