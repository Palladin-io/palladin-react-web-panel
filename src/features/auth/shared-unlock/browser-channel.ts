import { sharedUnlockOperationFrameSchema, sharedUnlockOperationSchema, type SharedUnlockOperationFrame, type SharedUnlockOperationMessage } from './browser-operation-message'
import { z } from 'zod'
import { randomBytes, wipe } from '../../../shared/crypto/sodium'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { isSharedUnlockExtensionId } from '../../../shared/lib/shared-unlock-extension-id'

const protocol = 'palladin.shared-unlock.browser.v1'
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/)
const readySchema = z.object({
  type: z.literal('ready'), protocol: z.literal(protocol), apiUrl: z.string().min(1).max(2048),
  webOrigin: z.string().min(1).max(2048), extensionId: z.string().refine(isSharedUnlockExtensionId),
  webNonce: nonceSchema, channelId: nonceSchema, documentBinding: z.string().min(1).max(256),
}).strict()

/** Browser API boundary; tests substitute the actual native Port contract. */
export interface SharedUnlockNativePort {
  /** Firefox's own-frame adapter additionally rechecks canonical browser resources. */
  assertCurrent?(): void
  verifyCurrent?(): Promise<void>
  postMessage(message: { type: 'hello'; protocol: typeof protocol; apiUrl: string; webNonce: string } | SharedUnlockOperationFrame): void
  disconnect(): void
  onMessage: { addListener(listener: (message: unknown) => void): void; removeListener(listener: (message: unknown) => void): void }
  onDisconnect: { addListener(listener: () => void): void; removeListener(listener: () => void): void }
}
export interface SharedUnlockNativeRuntime {
  connect(extensionId: string, options: { name: string }): SharedUnlockNativePort
  readonly lastError?: unknown
}
export interface SharedUnlockBrowserRoute {
  readonly apiUrl: string
  readonly webOrigin: string
  readonly extensionId: string
  readonly channelId: string
  readonly documentBinding: string
  readonly signal: AbortSignal
  close(): void
  assertCurrent(): void
  verifyCurrent(): Promise<void>
  sendOperation(message: SharedUnlockOperationMessage): void
  onOperation(listener: (message: SharedUnlockOperationMessage) => void): () => void
}
interface BrowserChannelOptions {
  readonly runtime: SharedUnlockNativeRuntime
  readonly extensionId: string
  readonly apiUrl: string
  readonly webOrigin: string
  /** Own live document/configuration check; not a claim supplied by the extension. */
  assertDocument(): void
}

/** Calls the browser with an independently configured exact ID. A payload ID is never authority.
 * Operation frames remain bound to the established channel and document. */
export function connectSharedUnlockBrowser(options: BrowserChannelOptions) {
  const { runtime, extensionId, apiUrl, webOrigin } = options
  const abort = new AbortController()
  let port: SharedUnlockNativePort | null = null
  let settled = false
  let requestNonce: string | null = null
  let routeBinding: { channelId: string; documentBinding: string } | null = null
  const operationListeners = new Set<(message: SharedUnlockOperationMessage) => void>()
  let resolveReady!: (route: SharedUnlockBrowserRoute) => void
  let rejectReady!: (error: Error) => void
  const ready = new Promise<SharedUnlockBrowserRoute>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  const close = () => {
    if (abort.signal.aborted) return
    clearTimeout(timeout)
    const disconnected = port
    port = null
    disconnected?.onMessage.removeListener(message)
    disconnected?.onDisconnect.removeListener(disconnect)
    abort.abort()
    operationListeners.clear()
    routeBinding = null
    if (!settled) { settled = true; rejectReady(new Error('Shared unlock browser channel unavailable')) }
    try { disconnected?.disconnect() } catch { /* Browser has already removed this Port. */ }
  }
  const assertCurrent = () => {
    try {
      if (abort.signal.aborted) throw new Error('Shared unlock browser channel closed')
      options.assertDocument()
      port?.assertCurrent?.()
      if (abort.signal.aborted) throw new Error('Shared unlock browser channel closed')
    } catch (error) { close(); throw error }
  }
  const disconnect = () => { void runtime.lastError; close() }
  const message = (raw: unknown) => {
    try {
      assertCurrent()
      if (settled) {
        const frame = sharedUnlockOperationFrameSchema.safeParse(raw)
        if (!frame.success || !routeBinding || frame.data.apiUrl !== apiUrl || frame.data.webNonce !== requestNonce
          || frame.data.channelId !== routeBinding.channelId || frame.data.documentBinding !== routeBinding.documentBinding
          || !operationListeners.size) { close(); return }
        for (const listener of [...operationListeners]) {
          assertCurrent(); listener({ attemptId: frame.data.attemptId, payload: frame.data.payload })
        }
        return
      }
      const parsed = readySchema.safeParse(raw)
      if (settled || !parsed.success) { close(); return }
      const received = parsed.data
      // The browser-selected Port establishes recipient identity. These comparisons
      // additionally fence correlation/environment; they cannot authenticate a fake Port.
      if (received.extensionId !== extensionId || received.apiUrl !== apiUrl || received.webOrigin !== webOrigin
        || received.webNonce !== requestNonce || !received.documentBinding.endsWith('/' + received.channelId)) { close(); return }
      assertCurrent()
      settled = true
      clearTimeout(timeout)
      routeBinding = { channelId: received.channelId, documentBinding: received.documentBinding }
      resolveReady(Object.freeze({ apiUrl, webOrigin, extensionId, channelId: received.channelId,
        documentBinding: received.documentBinding, signal: abort.signal, assertCurrent, close,
        verifyCurrent: async () => {
          try { assertCurrent(); await port?.verifyCurrent?.(); assertCurrent() }
          catch (error) { close(); throw error }
        },
        sendOperation: (message: SharedUnlockOperationMessage) => {
          assertCurrent()
          const parsed = sharedUnlockOperationSchema.parse(message)
          if (!port || !routeBinding || !requestNonce) throw new Error('Shared unlock channel unavailable')
          port.postMessage({ type: 'operation', protocol, apiUrl, webNonce: requestNonce, ...routeBinding, ...parsed })
        },
        onOperation: (listener: (message: SharedUnlockOperationMessage) => void) => {
          assertCurrent(); operationListeners.add(listener)
          return () => { operationListeners.delete(listener) }
        },
      }))
    } catch { close() }
  }
  const timeout = setTimeout(close, 5000)
  void (async () => {
    // Configuration is external build input; reject it before any browser call.
    if (!isSharedUnlockExtensionId(extensionId) || !validEndpoint(apiUrl, false) || !validEndpoint(webOrigin, true)) { close(); return }
    assertCurrent()
    const bytes = await randomBytes(32)
    try { requestNonce = encodeBase64Url(bytes) } finally { wipe(bytes) }
    assertCurrent()
    port = runtime.connect(extensionId, { name: protocol })
    port.onMessage.addListener(message)
    port.onDisconnect.addListener(disconnect)
    assertCurrent()
    port.postMessage({ type: 'hello', protocol, apiUrl, webNonce: requestNonce })
  })().catch(close)
  return { ready, signal: abort.signal, close }
}

// HTTP admission belongs to the independently configured extension pair and its explicit consent.
function validEndpoint(value: string, originOnly: boolean): boolean {
  try {
    const url = new URL(value)
    return value.length <= 2048 && !url.username && !url.password && !url.search && !url.hash
      && (url.protocol === 'https:' || url.protocol === 'http:')
      && (!originOnly || url.origin === value)
  } catch { return false }
}
