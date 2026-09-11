import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockPreferenceState } from './preference-state'

export const sharedUnlockPreferences = new SharedUnlockPreferenceState()
useAuthStore.subscribe((current, previous) => {
  if (current.userId !== previous.userId || current.cryptoSessionGeneration !== previous.cryptoSessionGeneration) {
    sharedUnlockPreferences.clear()
  }
})
