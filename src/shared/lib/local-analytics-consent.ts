import type { UserConsent } from '../api/consents-api'

const PREFIX = 'palladin-client-analytics:'
const CHANGE_EVENT = 'palladin-client-analytics-changed'
const blockedInMemory = new Set<string>()

interface LocalActivation { noticeVersion: string; noticeLocale: string; activationRevision: number }

export function readLocalAnalyticsActivation(userId: string): LocalActivation | null {
  if (blockedInMemory.has(userId)) return null
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`${PREFIX}${userId}`) ?? 'null')
    if (typeof value !== 'object' || value === null || !('noticeVersion' in value) || !('noticeLocale' in value) || !('activationRevision' in value)) return null
    if (typeof value.noticeVersion !== 'string' || typeof value.noticeLocale !== 'string' || typeof value.activationRevision !== 'number'
      || !Number.isSafeInteger(value.activationRevision) || value.activationRevision <= 0) return null
    return { noticeVersion: value.noticeVersion, noticeLocale: value.noticeLocale, activationRevision: value.activationRevision }
  } catch { return null }
}

export function setLocalAnalyticsActivation(userId: string, activation: LocalActivation | null): boolean {
  blockedInMemory.add(userId)
  try {
    if (activation) localStorage.setItem(`${PREFIX}${userId}`, JSON.stringify(activation))
    else localStorage.removeItem(`${PREFIX}${userId}`)
    blockedInMemory.delete(userId)
    window.dispatchEvent(new Event(CHANGE_EVENT))
    return true
  } catch {
    window.dispatchEvent(new Event(CHANGE_EVENT))
    return false
  }
}

export function subscribeLocalAnalyticsConsent(listener: () => void): () => void {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) listener()
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', storageChanged)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', storageChanged)
  }
}

export function matchesCurrentAnalyticsActivation(consent: UserConsent | undefined, activation: LocalActivation | null): boolean {
  return !!consent && consent.status === 'granted' && !!consent.currentNotice && !!activation
    && activation.noticeVersion === consent.noticeVersion && activation.noticeVersion === consent.currentNotice.version
    && activation.noticeLocale === consent.noticeLocale && activation.noticeLocale === consent.currentNotice.locale
    && activation.activationRevision === consent.activationRevision
}
