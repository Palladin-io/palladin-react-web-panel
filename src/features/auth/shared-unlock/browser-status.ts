import { useSyncExternalStore } from 'react'

export type SharedUnlockBrowserStatus = 'not-configured' | 'connecting' | 'connected' | 'unavailable' | 'unsupported'
let status: SharedUnlockBrowserStatus = 'not-configured'
const listeners = new Set<() => void>()
export function setSharedUnlockBrowserStatus(next: SharedUnlockBrowserStatus) {
  if (status === next) return
  status = next
  for (const listener of listeners) listener()
}
export function useSharedUnlockBrowserStatus() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => status)
}
