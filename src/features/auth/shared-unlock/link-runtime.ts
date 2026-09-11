import { env } from '../../../shared/lib/env'
import { SharedUnlockLinkStore } from './link-store'

// Only scoped link IDs, revisions and closing intents. No crypto/session material.
export const sharedUnlockLinks = new SharedUnlockLinkStore({
  get: async keys => {
    const result: Record<string, unknown> = {}
    for (const key of keys) { const value = localStorage.getItem(key); if (value !== null) result[key] = JSON.parse(value) }
    return result
  },
  set: async items => { for (const [key, value] of Object.entries(items)) localStorage.setItem(key, JSON.stringify(value)) },
})

export async function recordManualSharedUnlockLogout(accountId: string | null): Promise<void> {
  if (!accountId || !env.sharedUnlockExtensionId) return
  await sharedUnlockLinks.recordManualClosing({ accountId, apiUrl: env.apiUrl,
    webOrigin: window.location.origin, extensionId: env.sharedUnlockExtensionId }, 'logout')
}
