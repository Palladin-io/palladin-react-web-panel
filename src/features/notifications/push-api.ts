import { z } from 'zod'
import ky from 'ky'
import {
  api,
  authenticatedRequestContext,
} from '../../shared/api/client'
import type { AuthenticatedSessionSnapshot } from '../auth/session/session-boundary'
import { env } from '../../shared/lib/env'

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
  session?: AuthenticatedSessionSnapshot,
): Promise<string> {
  const raw = await api.post('api/push-tokens', {
    json: input,
    ...(session ? authenticatedRequestContext(session) : {}),
  }).json()
  return registerResponseSchema.parse(raw).id
}

export async function deletePushToken(
  id: string,
  session?: AuthenticatedSessionSnapshot,
): Promise<void> {
  await api.delete(
    `api/push-tokens/${id}`,
    session ? authenticatedRequestContext(session) : undefined,
  )
}

/**
 * Compensating cleanup for a registration whose owner changed while POST was
 * in flight. It intentionally uses only the initiating owner's access token,
 * never refreshes, retries as another principal, or runs response hooks.
 * The endpoint can only delete the opaque registration id returned by that
 * owner's POST.
 */
export async function deletePushTokenForOwner(
  id: string,
  owner: AuthenticatedSessionSnapshot,
): Promise<void> {
  if (!owner.accessToken) return
  await ky.delete(`api/push-tokens/${id}`, {
    prefixUrl: env.apiUrl,
    headers: { Authorization: `Bearer ${owner.accessToken}` },
    retry: 0,
  })
}

export async function listPushTokens(): Promise<PushToken[]> {
  const raw = await api.get('api/push-tokens').json()
  return pushTokenListSchema.parse(raw).items
}
