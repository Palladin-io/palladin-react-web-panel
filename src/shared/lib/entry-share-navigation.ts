import { entrySharePath } from '../crypto/entry-share-link'
import { captureEntryShareIngress, clearPendingEntryShare } from './entry-share-ingress'

/** Install before importing the router or any navigation/analytics subscribers. */
export function installEntryShareNavigation(browser: Window, onFailure: () => void): () => void {
  captureEntryShareIngress(browser)
  let failed = false
  function onNavigation(event: Event) {
    const { pathname, hash, search } = browser.location
    const sharing = isSharingPath(pathname)
    const rawHashEvent = event instanceof HashChangeEvent
      && [event.oldURL, event.newURL].some((value) => {
        try { return isSharingPath(new URL(value).pathname) } catch { return false }
      })
    // HashChangeEvent retains the raw old/new URLs even after address scrubbing.
    // Never forward that event to subscribers. The scrub's replaceState already
    // notifies browser history with the clean path; do not replay a raw event.
    if (rawHashEvent || sharing && event.type === 'hashchange') event.stopImmediatePropagation()
    if (!sharing || !hash && !search && isCanonicalPath(pathname)) return
    event.stopImmediatePropagation()
    if (failed) return
    try { captureEntryShareIngress(browser) }
    catch {
      failed = true
      clearPendingEntryShare()
      onFailure()
    }
  }
  browser.addEventListener('popstate', onNavigation, true)
  browser.addEventListener('hashchange', onNavigation, true)
  return () => {
    browser.removeEventListener('popstate', onNavigation, true)
    browser.removeEventListener('hashchange', onNavigation, true)
  }
}

function isSharingPath(path: string): boolean { return path === '/share' || path.startsWith('/share/') }
function isCanonicalPath(path: string): boolean {
  if (path === '/share') return true
  try { return entrySharePath(path.slice('/share/'.length)) === path } catch { return false }
}
