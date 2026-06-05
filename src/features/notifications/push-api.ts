import { z } from 'zod'
import { api } from '../../shared/api/client'

/** Push token platform discriminator — must match the backend enum. */
export const PUSH_PLATFORM_WEB = 'Web' as const

export interface RegisterPushTokenInput {
  token: string
  platform: typeof PUSH_PLATFORM_WEB
  deviceName?: string
}

const registerResponseSchema = z.object({ id: z.string() })

const pushTokenSchema = z.object({
  id: z.string(),
  platform: z.string(),
  deviceName: z.string().nullable().optional(),
  createdAt: z.string().optional(),
})

const pushTokenListSchema = z.object({ items: z.array(pushTokenSchema) })

export type PushToken = z.infer<typeof pushTokenSchema>

/** Register an FCM-for-Web token. Returns the server-assigned token id. */
export async function registerPushToken(
  input: RegisterPushTokenInput,
): Promise<string> {
  const raw = await api.post('api/push-tokens', { json: input }).json()
  return registerResponseSchema.parse(raw).id
}

export async function deletePushToken(id: string): Promise<void> {
  await api.delete(`api/push-tokens/${id}`)
}

export async function listPushTokens(): Promise<PushToken[]> {
  const raw = await api.get('api/push-tokens').json()
  return pushTokenListSchema.parse(raw).items
}
