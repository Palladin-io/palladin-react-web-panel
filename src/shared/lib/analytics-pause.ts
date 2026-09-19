import { analytics } from './analytics'

// Temporary form ownership, never persisted or used as an account preference.
const pauses = new Map<string, Set<symbol>>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(listener => listener())

export function isAnalyticsPaused(userId: string): boolean {
  return !!pauses.get(userId)?.size
}

export function subscribeAnalyticsPause(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function pauseAnalytics(userId: string): () => void {
  const owner = Symbol()
  const owners = pauses.get(userId) ?? new Set<symbol>()
  owners.add(owner)
  pauses.set(userId, owners)
  analytics.reset()
  notify()
  return () => {
    if (!owners.delete(owner)) return
    if (!owners.size) pauses.delete(userId)
    notify()
  }
}
