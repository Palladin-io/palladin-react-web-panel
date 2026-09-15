import type { SharedUnlockNativePort, SharedUnlockNativeRuntime } from './browser-channel'
import { isFirefoxSharedUnlockExtensionId } from '../../../shared/lib/shared-unlock-extension-id'

const discover = 'palladin.shared-unlock.firefox.discover.v1'
const candidate = 'palladin.shared-unlock.firefox.candidate.v1'
const closed = 'palladin.shared-unlock.firefox.closed.v1'
const bridgePath = '/src/shared-unlock-bridge/index.html'
const protocol = 'palladin.shared-unlock.browser.v1'
const browserOrigin = /^moz-extension:\/\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/

/** Browser resources are a separate trust boundary, not a Palladin API response.
 * The exact root manifest URL and browser MessageEvent origin/source establish
 * identity. Discovery payloads are untrusted hints and cannot choose a path, ID,
 * document binding, API or crypto context. Same-ID package replacement remains
 * the explicitly accepted compromised-client case. */
export function createFirefoxSharedUnlockRuntime(owner: Window, document: Document, expectedId: string,
  fetchResource: typeof fetch = owner.fetch.bind(owner)): SharedUnlockNativeRuntime {
  return {
    connect(extensionId, options) {
      if (!isFirefoxSharedUnlockExtensionId(expectedId) || extensionId !== expectedId || options.name !== protocol) {
        throw new Error('Invalid Firefox shared unlock configuration')
      }
      return connect(owner, document, expectedId, fetchResource)
    },
  }
}

function connect(owner: Window, document: Document, expectedId: string, fetchResource: typeof fetch): SharedUnlockNativePort {
  const webOrigin = owner.location.origin
  const abort = new AbortController()
  const messages = new Set<(message: unknown) => void>()
  const disconnects = new Set<() => void>()
  const seen = new Set<string>()
  const inbound: unknown[] = []
  let frame: HTMLIFrameElement | null = null
  let extensionOrigin: string | null = null
  let loaded = false
  let selecting = false
  let receiving = false
  let pendingHello: Parameters<SharedUnlockNativePort['postMessage']>[0] | null = null
  const close = () => {
    if (abort.signal.aborted) return
    abort.abort()
    clearInterval(discovery)
    clearTimeout(timeout)
    mutations.disconnect()
    owner.removeEventListener('message', message)
    owner.removeEventListener('pagehide', close)
    frame?.removeEventListener('load', load)
    frame?.remove()
    frame = null
    pendingHello = null
    inbound.length = 0
    messages.clear()
    for (const listener of [...disconnects]) listener()
    disconnects.clear()
  }
  const assertCurrent = () => {
    if (abort.signal.aborted || owner !== owner.top || owner.location.origin !== webOrigin
      || (document as Document & { prerendering?: boolean }).prerendering
      || (frame && (!frame.isConnected || frame.ownerDocument !== document || frame.src !== extensionOrigin + bridgePath))) {
      close(); throw new Error('Firefox shared unlock document retired')
    }
  }
  const verifyCurrent = async () => {
    try {
      assertCurrent()
      if (!frame || !loaded || !extensionOrigin) throw new Error('Firefox shared unlock frame unavailable')
      await verifyFirefoxCanonicalId(extensionOrigin, expectedId, fetchResource, abort.signal)
      assertCurrent()
    } catch (error) { close(); throw error }
  }
  const send = (raw: Parameters<SharedUnlockNativePort['postMessage']>[0]) => {
    assertCurrent()
    if (!loaded) {
      if (pendingHello || raw.type !== 'hello') { close(); throw new Error('Firefox shared unlock handshake not ready') }
      pendingHello = raw
      return
    }
    frame!.contentWindow!.postMessage(raw, extensionOrigin!)
  }
  const load = () => {
    try {
      assertCurrent()
      if (loaded) { close(); return }
      loaded = true
      const hello = pendingHello; pendingHello = null
      if (hello) send(hello)
    } catch { close() }
  }
  const acceptCandidate = async (origin: string) => {
    // A single in-flight discovery check; failed hints never authenticate a route.
    selecting = true
    try {
      await verifyFirefoxCanonicalId(origin, expectedId, fetchResource, abort.signal)
      assertCurrent()
      extensionOrigin = origin
      frame = document.createElement('iframe')
      frame.hidden = true
      frame.title = 'Palladin'
      frame.src = origin + bridgePath
      frame.addEventListener('load', load)
      document.body.append(frame)
      mutations.observe(document.body, { childList: true })
      mutations.observe(frame, { attributes: true, attributeFilter: ['src'] })
      clearInterval(discovery)
    } catch { /* A different installed add-on is not the configured recipient. */ }
    finally { selecting = false }
  }
  const message = (event: MessageEvent<unknown>) => {
    if (abort.signal.aborted) return
    const raw = event.data
    if (!frame && !selecting && event.source === owner && event.origin === webOrigin && raw && typeof raw === 'object'
      && !Array.isArray(raw) && Object.keys(raw).sort().join(',') === 'origin,type') {
      const hint = raw as { type: unknown; origin: unknown }
      if (hint.type !== candidate || typeof hint.origin !== 'string' || !browserOrigin.test(hint.origin) || seen.has(hint.origin)) return
      if (seen.size >= 8) { close(); return }
      seen.add(hint.origin)
      void acceptCandidate(hint.origin)
      return
    }
    if (!loaded || !frame || event.source !== frame.contentWindow || event.origin !== extensionOrigin) return
    if (raw && typeof raw === 'object' && Object.keys(raw).join(',') === 'type' && (raw as { type: unknown }).type === closed) { close(); return }
    if (inbound.length >= 4) { close(); return }
    inbound.push(raw)
    if (receiving) return
    receiving = true
    void (async () => {
      while (inbound.length && !abort.signal.aborted) {
        const next = inbound.shift()
        await verifyCurrent()
        assertCurrent()
        for (const listener of [...messages]) { assertCurrent(); listener(next) }
      }
    })().catch(close).finally(() => { receiving = false })
  }
  const discoverNow = () => {
    try { assertCurrent(); owner.postMessage({ type: discover }, webOrigin) } catch { close() }
  }
  const discovery = setInterval(discoverNow, 600)
  const mutations = new MutationObserver(records => {
    // Retire even if script removes/reinserts the same element or restores src
    // before this callback. A new document needs a new browser channel.
    if (frame && records.some(record => (record.type === 'attributes' && record.target === frame)
      || [...record.removedNodes].includes(frame!))) close()
  })
  // The outer channel has its own handshake deadline; keep this adapter bounded
  // even when used independently. A valid ready frame ends this local deadline.
  const timeout = setTimeout(close, 5000)
  messages.add(raw => {
    if (raw && typeof raw === 'object' && (raw as { type?: unknown }).type === 'ready') clearTimeout(timeout)
  })
  owner.addEventListener('message', message)
  owner.addEventListener('pagehide', close)
  discoverNow()
  return { postMessage: send, disconnect: close, assertCurrent, verifyCurrent,
    onMessage: { addListener: listener => messages.add(listener), removeListener: listener => messages.delete(listener) },
    onDisconnect: { addListener: listener => disconnects.add(listener), removeListener: listener => disconnects.delete(listener) },
  }
}

/** Fixed browser-generated resource, bounded in bytes and time, never redirected
 * or served by the page. Re-read after asynchronous crypto/Identity work and on
 * inbound frames so a removed or changed add-on cannot use cached trust. */
export async function verifyFirefoxCanonicalId(origin: string, expectedId: string, fetchResource: typeof fetch, signal: AbortSignal): Promise<void> {
  if (!browserOrigin.test(origin) || !isFirefoxSharedUnlockExtensionId(expectedId)) throw new Error('Invalid Firefox resource identity')
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const deadline = Date.now() + 2000
  const timeout = setTimeout(cancel, 2000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    if (controller.signal.aborted) throw new Error('Firefox resource read retired')
    const url = origin + '/manifest.json'
    const response = await fetchResource(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: controller.signal })
    if (!response.ok || response.redirected || response.url !== url || !response.body) throw new Error('Firefox canonical manifest unavailable')
    reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const chunk = await reader.read()
      if (controller.signal.aborted || Date.now() >= deadline) throw new Error('Firefox manifest read expired')
      if (chunk.done) break
      size += chunk.value.length
      if (size > 65536) throw new Error('Firefox manifest exceeds resource limit')
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const manifest: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    const gecko = (manifest as { browser_specific_settings?: { gecko?: { id?: unknown } } } | null)?.browser_specific_settings?.gecko
    if (gecko?.id !== expectedId || controller.signal.aborted || Date.now() >= deadline) throw new Error('Firefox canonical identity mismatch')
  } finally {
    controller.abort()
    clearTimeout(timeout)
    signal.removeEventListener('abort', cancel)
    await reader?.cancel().catch(() => undefined)
  }
}
