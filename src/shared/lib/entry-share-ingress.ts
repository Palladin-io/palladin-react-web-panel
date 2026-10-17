import {
  clearEntryShareLink, entrySharePath, parseEntryShareFragment,
  type EntryShareLinkSecrets,
} from '../crypto/entry-share-link'

interface PendingEntryShare extends EntryShareLinkSecrets {
  shareId: string
}

const LINK_MEMORY_LIFETIME_MS = 15 * 60 * 1000
let pending: PendingEntryShare | null = null
let ingressVersion = 0
let expiry: ReturnType<typeof setTimeout> | undefined
let expiresAt = 0
let monotonicExpiresAt = 0
const listeners = new Set<() => void>()

export function subscribePendingEntryShare(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function clearPendingEntryShare(): void {
  const changed = pending !== null
  if (pending) clearEntryShareLink(pending)
  pending = null
  expiresAt = 0
  monotonicExpiresAt = 0
  clearTimeout(expiry)
  if (changed) for (const listener of listeners) listener()
}

export function readPendingEntryShare(shareId: string): Readonly<PendingEntryShare> | null {
  if (Date.now() >= expiresAt || performance.now() >= monotonicExpiresAt) clearPendingEntryShare()
  return pending?.shareId === shareId ? pending : null
}

/** A value-free React ownership key; never pass the actual capability into a route. */
export function readEntryShareIngressVersion(shareId: string): number {
  return readPendingEntryShare(shareId) ? ingressVersion : 0
}

export function captureEntryShareIngress(browser: Window): void {
  const { pathname, hash } = browser.location
  if (pathname !== '/share' && !pathname.startsWith('/share/')) return
  clearPendingEntryShare()
  let shareId: string | undefined
  let cleanPath = '/share'
  try {
    const candidate = pathname.slice('/share/'.length)
    if (entrySharePath(candidate) === pathname) {
      shareId = candidate
      cleanPath = pathname
    }
  } catch { /* An invalid link must not leave secret-looking path data in the router. */ }

  // Clear history state too: neither auth redirects nor router/analytics imports may see the fragment.
  browser.history.replaceState(null, '', cleanPath)
  if (!shareId) return
  try {
    pending = { shareId, ...parseEntryShareFragment(hash) }
    ingressVersion += 1
    expiresAt = Date.now() + LINK_MEMORY_LIFETIME_MS
    monotonicExpiresAt = performance.now() + LINK_MEMORY_LIFETIME_MS
    expiry = setTimeout(clearPendingEntryShare, LINK_MEMORY_LIFETIME_MS)
    browser.addEventListener('pagehide', clearPendingEntryShare, { once: true })
    for (const listener of listeners) listener()
  } catch {
    clearPendingEntryShare()
  }
}
