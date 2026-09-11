import { sharedUnlockPreferenceGate } from "./preference-runtime"
import { env } from '../../../shared/lib/env'
import { SharedUnlockApi, type SharedUnlockOwnSession } from './api'
import { deliverSharedUnlockClosings, flushSharedUnlockClosings } from './closing'
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
  await recordManualClosing(accountId, 'logout')
}

export async function recordManualSharedUnlockLock(accountId: string | null): Promise<void> {
  await recordManualClosing(accountId, 'lock')
}

async function recordManualClosing(accountId: string | null, action: 'lock' | 'logout'): Promise<void> {
  if (!accountId || !env.sharedUnlockExtensionId) return
  const scope = { accountId, apiUrl: env.apiUrl, webOrigin: window.location.origin, extensionId: env.sharedUnlockExtensionId }
  if (!await sharedUnlockPreferenceGate.isAllowed(scope)) return
  await sharedUnlockLinks.recordManualClosing(scope, action)
}

const api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl)
const ownScope = (session: SharedUnlockOwnSession) => ({ accountId: session.userId, apiUrl: session.apiUrl,
  webOrigin: window.location.origin, extensionId: env.sharedUnlockExtensionId })
export async function flushManualSharedUnlockClosings(session: SharedUnlockOwnSession, signal: AbortSignal, check: () => void): Promise<void> {
  if (!env.sharedUnlockExtensionId) return
  if (!await sharedUnlockPreferenceGate.isAllowed({ accountId: session.userId, apiUrl: session.apiUrl })) return
  await flushSharedUnlockClosings(ownScope(session), session, sharedUnlockLinks, api, signal, () => { check(); sharedUnlockPreferenceGate.assertAllowed(ownScope(session)) })
}
export async function deliverManualSharedUnlockLogout(session: SharedUnlockOwnSession, check: () => void): Promise<void> {
  await deliverManualClosing(session, check)
}
export async function deliverManualSharedUnlockLock(session: SharedUnlockOwnSession, check: () => void): Promise<void> {
  await deliverManualClosing(session, check)
}
async function deliverManualClosing(session: SharedUnlockOwnSession, check: () => void): Promise<void> {
  if (!env.sharedUnlockExtensionId) return
  if (!await sharedUnlockPreferenceGate.isAllowed({ accountId: session.userId, apiUrl: session.apiUrl })) return
  await deliverSharedUnlockClosings([ownScope(session)], session, sharedUnlockLinks, api, () => { check(); sharedUnlockPreferenceGate.assertAllowed(ownScope(session)) })
}
