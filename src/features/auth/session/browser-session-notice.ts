import { env } from '../../../shared/lib/env'
import { randomUuid } from '../../../shared/crypto/random-uuid'

export const browserSessionNoticeKey = `palladin.browser-session:${new URL(env.apiUrl).origin}`
export interface BrowserSessionNotice { kind: 'replace' | 'shared' | 'logout'; sessionId: string; nonce: string }

/** Denial/revalidation hints only. No credentials or unlock authority cross tabs. */
export function publishBrowserSessionNotice(kind: BrowserSessionNotice['kind'], sessionId: string): void {
  localStorage.setItem(browserSessionNoticeKey, JSON.stringify({ kind, sessionId, nonce: randomUuid() }))
}

export function readBrowserSessionNotice(): BrowserSessionNotice | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(browserSessionNoticeKey) ?? 'null')
    if (!value || typeof value !== 'object' || !('kind' in value) || !('sessionId' in value) || !('nonce' in value)
      || !['replace', 'shared', 'logout'].includes(String(value.kind))
      || typeof value.sessionId !== 'string' || typeof value.nonce !== 'string') return null
    return value as BrowserSessionNotice
  } catch { return null }
}
