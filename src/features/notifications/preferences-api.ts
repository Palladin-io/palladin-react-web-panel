import { api } from '../../shared/api/client'

/**
 * Notification preferences API — frozen contract. Matrix-style
 * per-type × per-channel toggles (inbox / realtime / push).
 *
 * `mandatory` types (agent_pending, grant_pending, grant_revoked) have inbox +
 * realtime LOCKED on; only push is mutable. The server ignores inbox/realtime
 * changes on mandatory rows and returns the EFFECTIVE state, so the UI renders
 * straight from the response rather than guessing.
 */

export interface PreferenceItem {
  type: string
  category: string
  inboxEnabled: boolean
  signalREnabled: boolean
  pushEnabled: boolean
  mandatory: boolean
}

/** The three deliverable channels — column identity for the preferences grid. */
export const PREFERENCE_CHANNELS = ['inbox', 'realtime', 'push'] as const
export type PreferenceChannel = (typeof PREFERENCE_CHANNELS)[number]

export interface PreferencesResponse {
  items: PreferenceItem[]
}

export async function getNotificationPreferences(): Promise<PreferenceItem[]> {
  const raw = await api.get('api/notifications/preferences').json<PreferencesResponse>()
  return raw.items
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
    .json<PreferencesResponse>()
  return raw.items
}
