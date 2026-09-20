import {
  clearEntryShareLink, entrySharePath, parseEntryShareFragment,
  type EntryShareLinkSecrets,
} from '../crypto/entry-share-link'

interface PendingEntryShare extends EntryShareLinkSecrets {
  shareId: string
}

const LINK_MEMORY_LIFETIME_MS = 15 * 60 * 1000
let pending: PendingEntryShare | null = null
let expiry: ReturnType<typeof setTimeout> | undefined
let expiresAt = 0
let monotonicExpiresAt = 0

export function clearPendingEntryShare(): void {
  if (pending) clearEntryShareLink(pending)
  pending = null
  expiresAt = 0
  monotonicExpiresAt = 0
  clearTimeout(expiry)
}

export function readPendingEntryShare(shareId: string): Readonly<PendingEntryShare> | null {
  if (Date.now() >= expiresAt || performance.now() >= monotonicExpiresAt) clearPendingEntryShare()
  return pending?.shareId === shareId ? pending : null
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
    expiresAt = Date.now() + LINK_MEMORY_LIFETIME_MS
    monotonicExpiresAt = performance.now() + LINK_MEMORY_LIFETIME_MS
    expiry = setTimeout(clearPendingEntryShare, LINK_MEMORY_LIFETIME_MS)
    browser.addEventListener('pagehide', clearPendingEntryShare, { once: true })
  } catch {
    clearPendingEntryShare()
  }
}
