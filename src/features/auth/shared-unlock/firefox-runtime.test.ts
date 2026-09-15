import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFirefoxSharedUnlockRuntime, verifyFirefoxCanonicalId } from './firefox-runtime'

const id = 'browser-extension@palladin.io'
const origin = 'moz-extension://ab38a993-33a3-4380-9b40-0deef02e3b41'
const manifestUrl = origin + '/manifest.json'
const protocol = 'palladin.shared-unlock.browser.v1'
const hello = { type: 'hello' as const, protocol, apiUrl: 'https://api.example.test', webNonce: 'A'.repeat(43) } as const
const ready = { ...hello, type: 'ready', extensionId: id, webOrigin: window.location.origin,
  channelId: 'E'.repeat(43), documentBinding: '7/top/bridge/' + 'E'.repeat(43) }
const manifest = JSON.stringify({ browser_specific_settings: { gecko: { id } } })
function response(body = manifest, url = manifestUrl, status = 200) {
  const value = new Response(body, { status })
  Object.defineProperty(value, 'url', { value: url })
  return value
}
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }
function fixture() {
  const fetchResource = vi.fn(async () => response())
  const runtime = createFirefoxSharedUnlockRuntime(window, document, id, fetchResource)
  const port = runtime.connect(id, { name: protocol })
  const received = vi.fn(), disconnected = vi.fn()
  port.onMessage.addListener(received); port.onDisconnect.addListener(disconnected)
  const candidate = (value: unknown = { type: 'palladin.shared-unlock.firefox.candidate.v1', origin }, patch = {}) =>
    window.dispatchEvent(new MessageEvent('message', { data: value, origin: window.location.origin, source: window, ...patch }))
  const connect = async () => {
    port.postMessage(hello); candidate(); await settle()
    const frame = document.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {})
    frame.dispatchEvent(new Event('load')); return { frame, post }
  }
  const incoming = (frame: HTMLIFrameElement, data: unknown = ready, patch = {}) =>
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: frame.contentWindow, ...patch }))
  return { port, runtime, received, disconnected, fetchResource, candidate, connect, incoming }
}
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(window, 'postMessage').mockImplementation(() => {}) })
afterEach(() => { window.dispatchEvent(new Event('pagehide')); document.querySelectorAll('iframe').forEach(frame => frame.remove()); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Firefox canonical browser-resource identity', () => {
  it('reads only the independently constructed canonical URL without credentials, redirects or cache', async () => {
    const fetchResource = vi.fn(async () => response())
    await verifyFirefoxCanonicalId(origin, id, fetchResource, new AbortController().signal)
    expect(fetchResource).toHaveBeenCalledExactlyOnceWith(manifestUrl, expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'no-store' }))
  })
  it.each(['https://evil.example.test', origin + '/fake-manifest.json', origin + '?id=' + id, origin + '#manifest.json',
    'moz-extension://user@ab38a993-33a3-4380-9b40-0deef02e3b41', 'moz-extension://*'])(
    'rejects a supplied resource path or non-browser origin %s before fetch', async value => {
      const fetchResource = vi.fn()
      await expect(verifyFirefoxCanonicalId(value, id, fetchResource, new AbortController().signal)).rejects.toThrow()
      expect(fetchResource).not.toHaveBeenCalled()
    })
  it.each([
    ['other ID', JSON.stringify({ browser_specific_settings: { gecko: { id: 'other@example.test' } } })],
    ['claimed legacy alias', JSON.stringify({ applications: { gecko: { id } } })],
    ['invalid JSON', '{'], ['null', 'null'], ['oversized manifest', ' '.repeat(65537)],
  ])('rejects %s at the independent resource boundary', async (_name, body) => {
    await expect(verifyFirefoxCanonicalId(origin, id, vi.fn(async () => response(body)), new AbortController().signal)).rejects.toThrow()
  })
  it.each(['redirect', 'other URL', 'HTTP failure'])('rejects %s despite a matching JSON ID', async reason => {
    const res = response(manifest, reason === 'other URL' ? origin + '/fake-manifest.json' : manifestUrl, reason === 'HTTP failure' ? 404 : 200)
    if (reason === 'redirect') Object.defineProperty(res, 'redirected', { value: true })
    await expect(verifyFirefoxCanonicalId(origin, id, vi.fn(async () => res), new AbortController().signal)).rejects.toThrow()
  })
  it('discards a late successful read after retirement', async () => {
    const abort = new AbortController()
    let finish!: (value: Response) => void
    const fetchResource = vi.fn(() => new Promise<Response>(resolve => { finish = resolve }))
    const result = verifyFirefoxCanonicalId(origin, id, fetchResource, abort.signal)
    abort.abort(); finish(response())
    await expect(result).rejects.toThrow()
  })
})

describe('Firefox Web iframe transport', () => {
  it('buffers only hello until the canonical-ID-verified frame loads, then rechecks incoming frames', async () => {
    const f = fixture(), { frame, post } = await f.connect()
    expect(frame.src).toBe(origin + '/src/shared-unlock-bridge/index.html')
    expect(post).toHaveBeenCalledExactlyOnceWith(hello, origin)
    f.incoming(frame); expect(f.received).not.toHaveBeenCalled(); await settle()
    expect(f.received).toHaveBeenCalledExactlyOnceWith(ready)
    expect(f.fetchResource).toHaveBeenCalledTimes(2)
    await f.port.verifyCurrent!(); expect(f.fetchResource).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(6000); expect(f.disconnected).not.toHaveBeenCalled()
    f.port.disconnect()
  })
  it.each([{ source: null }, { source: {} }, { origin: 'https://evil.example.test' }])('ignores a substituted discovery sender %#', async patch => {
    const f = fixture(); f.candidate(undefined, patch); await settle()
    expect(f.fetchResource).not.toHaveBeenCalled(); f.port.disconnect()
  })
  it('ignores a fake resource path and payload ID without creating a frame', async () => {
    const f = fixture()
    f.candidate({ type: 'palladin.shared-unlock.firefox.candidate.v1', origin, extensionId: id, url: origin + '/fake-manifest.json' })
    await settle(); expect(f.fetchResource).not.toHaveBeenCalled(); expect(document.querySelector('iframe')).toBeNull(); f.port.disconnect()
  })
  it('does not trust a different add-on with the claimed correct ready payload', async () => {
    const f = fixture(); f.fetchResource.mockResolvedValue(response(JSON.stringify({ browser_specific_settings: { gecko: { id: 'other@example.test' } } })))
    f.candidate(); await settle(); expect(document.querySelector('iframe')).toBeNull(); f.port.disconnect()
  })
  it.each([{ source: window }, { origin: 'moz-extension://00000000-0000-0000-0000-000000000000' }, { origin: 'null' }])(
    'ignores an incoming frame with substituted native source/origin %#', async patch => {
      const f = fixture(), { frame } = await f.connect(); f.incoming(frame, ready, patch); await settle()
      expect(f.received).not.toHaveBeenCalled(); expect(f.fetchResource).toHaveBeenCalledTimes(1); f.port.disconnect()
    })
  it.each(['reload', 'removal', 'src replacement', 'pagehide'])('retires on %s and never delivers late data', async reason => {
    const f = fixture(), { frame } = await f.connect()
    if (reason === 'reload') frame.dispatchEvent(new Event('load'))
    if (reason === 'removal') frame.remove()
    if (reason === 'src replacement') frame.src = origin + '/other.html'
    if (reason === 'pagehide') window.dispatchEvent(new Event('pagehide'))
    expect(() => f.port.assertCurrent!()).toThrow()
    f.incoming(frame); await settle(); expect(f.received).not.toHaveBeenCalled(); expect(f.disconnected).toHaveBeenCalledOnce()
  })
  it('retires when canonical identity disappears between frames', async () => {
    const f = fixture(), { frame } = await f.connect()
    f.fetchResource.mockRejectedValue(new Error('removed'))
    f.incoming(frame); await settle(); expect(f.received).not.toHaveBeenCalled(); expect(f.disconnected).toHaveBeenCalledOnce()
  })
  it.each(['remove-reinsert', 'restore-src'])('retires immediately after %s even when the DOM looks unchanged again', async reason => {
    const f = fixture(), { frame } = await f.connect()
    if (reason === 'remove-reinsert') { frame.remove(); document.body.append(frame) }
    else { const url = frame.src; frame.src = origin + '/other.html'; frame.src = url }
    await settle(); expect(f.disconnected).toHaveBeenCalledOnce(); expect(() => f.port.assertCurrent!()).toThrow()
  })
  it('bounds frames queued behind a pending identity check', async () => {
    const f = fixture(), { frame } = await f.connect()
    let finish!: (value: Response) => void
    f.fetchResource.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    for (let i = 0; i < 6; i++) f.incoming(frame)
    finish(response()); await settle()
    expect(f.received).not.toHaveBeenCalled(); expect(f.disconnected).toHaveBeenCalledOnce()
  })
  it('closes after its discovery deadline and ignores late candidates', async () => {
    const f = fixture(); await vi.advanceTimersByTimeAsync(5000); f.candidate(); await settle()
    expect(f.fetchResource).not.toHaveBeenCalled(); expect(f.disconnected).toHaveBeenCalledOnce()
  })
})
