import { z } from 'zod'
import { api } from '../../shared/api/client'

/**
 * Notification preferences API — FROZEN contract (CVT-162). LinkedIn-style
 * per-type × per-channel toggles (inbox / realtime / push).
 *
 * `mandatory` types (agent_pending, grant_pending, grant_revoked) have inbox +
 * realtime LOCKED on; only push is mutable. The server ignores inbox/realtime
 * changes on mandatory rows and returns the EFFECTIVE state, so the UI renders
 * straight from the response rather than guessing.
 */

const preferenceItemSchema = z.object({
  type: z.string(),
  category: z.enum(['ActionRequired', 'Update']),
  inboxEnabled: z.boolean(),
  signalREnabled: z.boolean(),
  pushEnabled: z.boolean(),
  mandatory: z.boolean(),
})

export type PreferenceItem = z.infer<typeof preferenceItemSchema>

/** The three deliverable channels — column identity for the preferences grid. */
export const PREFERENCE_CHANNELS = ['inbox', 'realtime', 'push'] as const
export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number]

const preferencesResponseSchema = z.object({
  items: z.array(preferenceItemSchema),
})

export type PreferencesResponse = z.infer<typeof preferencesResponseSchema>

export async function getNotificationPreferences(): Promise<PreferenceItem[]> {
  const raw = await api.get('api/notifications/preferences').json()
  return preferencesResponseSchema.parse(raw).items
}

/** One channel toggle for one type. The server upserts only the deltas. */
export interface PreferenceUpdate {
  type: string
  inboxEnabled?: boolean
  signalREnabled?: boolean
  pushEnabled?: boolean
}

/**
 * Upsert preference deltas. Returns the effective state for every type (with
 * mandatory locks applied server-side), which the UI uses to reconcile.
 */
export async function updateNotificationPreferences(
  updates: PreferenceUpdate[],
): Promise<PreferenceItem[]> {
  const raw = await api
    .put('api/notifications/preferences', { json: { items: updates } })
    .json()
  return preferencesResponseSchema.parse(raw).items
}
