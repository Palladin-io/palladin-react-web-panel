import { withSharedUnlockStorageLock } from './storage-lock'
import { SharedUnlockPreferenceGate } from './preference-gate'

export const sharedUnlockPreferenceGate = new SharedUnlockPreferenceGate({
  get: async keys => {
    const result: Record<string, unknown> = {}
    for (const key of keys) { const value = localStorage.getItem(key); if (value !== null) result[key] = JSON.parse(value) }
    return result
  },
  set: async items => { for (const [key, value] of Object.entries(items)) localStorage.setItem(key, JSON.stringify(value)) },
}, action => withSharedUnlockStorageLock("pause", action))

if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.storageArea === localStorage && event.key) sharedUnlockPreferenceGate.refreshExternalKey(event.key)
})
