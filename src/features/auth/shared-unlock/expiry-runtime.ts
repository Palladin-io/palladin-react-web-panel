import { SharedUnlockExpiryStore } from './expiry-store'

export const sharedUnlockExpiry = new SharedUnlockExpiryStore({
  get: async keys => {
    const result: Record<string, unknown> = {}
    for (const key of keys) { const value = localStorage.getItem(key); if (value !== null) result[key] = JSON.parse(value) }
    return result
  },
  set: async items => { for (const [key, value] of Object.entries(items)) localStorage.setItem(key, JSON.stringify(value)) },
})
