import type { SharedUnlockBrowserStatus } from './browser-status'
import { connectSharedUnlockBrowser, type SharedUnlockBrowserRoute, type SharedUnlockNativeRuntime } from './browser-channel'

interface LifecycleOptions {
  readonly authoritySync?: boolean
  readonly extensionId: string
  readonly apiUrl: string
  readonly window: Window
  readonly document: Document
  runtime(): SharedUnlockNativeRuntime | undefined
  /** Register the document coordinator before receiving operation frames. */
  onReady?(route: SharedUnlockBrowserRoute): void
  /** Local document retirement, not manual group lock/logout or peer loss. */
  retireDocument(): void
  onStatus?(status: SharedUnlockBrowserStatus): void
}

/** Document-owned channel, with bounded reconnect delays and no activity/Identity side effects. */
export function startSharedUnlockBrowserLifecycle(options: LifecycleOptions) {
  const { window: owner, document, extensionId, apiUrl } = options
  const webOrigin = owner.location.origin
  let stopped = false
  let hiddenDocument = false
  let retry: ReturnType<typeof setTimeout> | null = null
  let failures = 0
  let legacy = false
  let reprobed = false
  let protocolRetry: ReturnType<typeof setTimeout> | null = null
  let connection: ReturnType<typeof connectSharedUnlockBrowser> | null = null
  let route: SharedUnlockBrowserRoute | null = null
  const clearRetry = () => { if (retry !== null) clearTimeout(retry); retry = null }
  const retire = () => {
    clearRetry()
    if (protocolRetry !== null) clearTimeout(protocolRetry)
    protocolRetry = null
    const old = connection
    connection = null
    route = null
    old?.close()
  }
  const activeDocument = () => !stopped && !hiddenDocument && owner === owner.top && owner.location.origin === webOrigin
    && !(document as Document & { prerendering?: boolean }).prerendering
  const assertDocument = () => { if (!activeDocument()) throw new Error('Shared unlock document retired') }
  const reconnect = () => {
    if (!activeDocument() || connection || retry !== null) return
    // A live background tab may supply a fresh handoff after worker loss.
    // Reconnection is not activity and cannot renew either client's deadlines.
    // pagehide/prerender retirement remains enforced by activeDocument().
    retry = setTimeout(() => { retry = null; connect() }, Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)))
  }
  const connect = () => {
    if (!activeDocument() || connection || !extensionId) return
    options.onStatus?.('connecting')
    const runtime = options.runtime()
    if (!runtime) { options.onStatus?.('unavailable'); reconnect(); return }
    const useV2 = options.authoritySync && !legacy
    const pending = connectSharedUnlockBrowser({ runtime, extensionId, apiUrl, webOrigin, assertDocument,
      protocol: useV2 ? 'palladin.shared-unlock.browser.v2' : 'palladin.shared-unlock.browser.v1' })
    connection = pending
    pending.signal.addEventListener('abort', () => {
      if (connection !== pending) return
      connection = null
      route = null
      options.onStatus?.('unavailable')
      reconnect()
    }, { once: true })
    let established = false
    void pending.ready.then(ready => {
      established = true
      // Re-probe v2 on the next connection after a successful legacy session.
      legacy = false
      if (connection !== pending) { pending.close(); return }
      ready.assertCurrent()
      route = ready
      options.onReady?.(ready)
      options.onStatus?.('connected')
      failures = 0
      if (!useV2 && options.authoritySync && !reprobed) {
        reprobed = true
        protocolRetry = setTimeout(() => {
          protocolRetry = null
          if (connection !== pending || !activeDocument()) return
          retire(); connect()
        }, 30_000)
      }
    }).catch(() => {
      // Downgrade only a failed handshake, never a failed live operation.
      if (!established && useV2 && activeDocument()) legacy = true
      if (connection === pending) options.onStatus?.('unavailable')
      pending.close()
      if (connection === pending) { connection = null; route = null; reconnect() }
    })
  }
  const pagehide = () => {
    hiddenDocument = true
    retire()
    options.retireDocument()
  }
  const pageshow = () => { hiddenDocument = false; clearRetry(); connect() }
  const visibility = () => { if (document.visibilityState !== 'hidden') { clearRetry(); connect() } }
  owner.addEventListener('pagehide', pagehide)
  owner.addEventListener('pageshow', pageshow)
  document.addEventListener('visibilitychange', visibility)
  document.addEventListener('prerenderingchange', visibility)
  connect()
  return {
    currentRoute: () => { route?.assertCurrent(); return route },
    close() {
      if (stopped) return
      stopped = true
      retire()
      owner.removeEventListener('pagehide', pagehide)
      owner.removeEventListener('pageshow', pageshow)
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('prerenderingchange', visibility)
    },
  }
}
