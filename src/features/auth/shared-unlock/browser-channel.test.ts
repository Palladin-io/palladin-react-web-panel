import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { connectSharedUnlockBrowser, type SharedUnlockNativeRuntime } from './browser-channel'
vi.mock('../../../shared/crypto/sodium', () => ({ randomBytes: async () => new Uint8Array(32), wipe: (bytes: Uint8Array) => bytes.fill(0) }))
function event<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => void>()
  return { addListener: (callback: (...args: T) => void) => listeners.add(callback),
    removeListener: (callback: (...args: T) => void) => listeners.delete(callback),
    emit: (...args: T) => { for (const callback of [...listeners]) callback(...args) }, listeners }
}
function fixture() {
  const port = { onMessage: event<[unknown]>(), onDisconnect: event<[]>(), postMessage: vi.fn(), disconnect: vi.fn() }
  const runtime: SharedUnlockNativeRuntime = { connect: vi.fn(() => port) }
  const options = { runtime, extensionId: 'a'.repeat(32), apiUrl: 'https://api.example.test', webOrigin: 'https://app.example.test', assertDocument: vi.fn() }
  const frame = { type: 'ready', protocol: 'palladin.shared-unlock.browser.v1', apiUrl: options.apiUrl,
    webOrigin: options.webOrigin, extensionId: options.extensionId, webNonce: 'A'.repeat(43), channelId: 'E'.repeat(43), documentBinding: `7/document/${'E'.repeat(43)}` }
  return { port, options, frame }
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
describe('Web browser-authenticated channel', () => {
  it('addresses the independently configured extension and exposes a bounded frozen route', async () => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); await settle()
    expect(f.options.runtime.connect).toHaveBeenCalledWith(f.options.extensionId, { name: f.frame.protocol })
    expect(f.port.postMessage).toHaveBeenCalledWith({ type: 'hello', protocol: f.frame.protocol, apiUrl: f.options.apiUrl, webNonce: f.frame.webNonce })
    f.port.onMessage.emit(f.frame); const route = await c.ready; expect(Object.isFrozen(route)).toBe(true)
    expect(route.documentBinding).toBe(f.frame.documentBinding); route.assertCurrent()
    await vi.advanceTimersByTimeAsync(6000); expect(c.signal.aborted).toBe(false)
    c.close(); expect(() => route.assertCurrent()).toThrow()
  })
  it.each([
    { type: 'offer' }, { protocol: 'other' }, { apiUrl: 'https://other.example.test' }, { webOrigin: 'https://other.example.test' },
    { extensionId: 'b'.repeat(32) }, { extensionId: 'z'.repeat(32) }, { webNonce: 'E'.repeat(43) }, { webNonce: 'A'.repeat(42) + 'B' },
    { channelId: 'invalid' }, { documentBinding: '7/document/different' }, { documentBinding: 'a'.repeat(257) },
    { accessToken: 'synthetic' }, { masterKey: 'synthetic' },
  ])('rejects substituted or expanded ready frame %#', async patch => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); const result = c.ready.catch(error => error)
    await settle(); f.port.onMessage.emit({ ...f.frame, ...patch }); expect(await result).toBeInstanceOf(Error)
    expect(c.signal.aborted).toBe(true); expect(f.port.onMessage.listeners.size).toBe(0)
  })
  it.each([null, [], {}, 'ready'])('rejects non-frame %#', async raw => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); const result = c.ready.catch(error => error)
    await settle(); f.port.onMessage.emit(raw); expect(await result).toBeInstanceOf(Error)
  })
  it.each([{ extensionId: '' }, { extensionId: '*' }, { apiUrl: 'http://remote.example.test' },
    { apiUrl: 'https://name@api.example.test' }, { apiUrl: 'https://api.example.test?q=1' },
    { webOrigin: 'https://app.example.test/path' }, { webOrigin: 'null' },
  ])('rejects unsafe configuration before contacting a browser %#', async patch => {
    const f = fixture(); const c = connectSharedUnlockBrowser({ ...f.options, ...patch }); await expect(c.ready).rejects.toThrow()
    expect(f.options.runtime.connect).not.toHaveBeenCalled()
  })
  it('cancels pending initialization before any native connect', async () => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); c.close(); await expect(c.ready).rejects.toThrow()
    await settle(); expect(f.options.runtime.connect).not.toHaveBeenCalled()
  })
  it('times out and tears down without depending on a local disconnect event', async () => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); const result = c.ready.catch(error => error)
    await settle(); await vi.advanceTimersByTimeAsync(5000); expect(await result).toBeInstanceOf(Error)
    expect(f.port.disconnect).toHaveBeenCalledOnce(); expect(f.port.onDisconnect.listeners.size).toBe(0)
  })
  it('retires a ready route on peer loss without an auth-store side effect', async () => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); await settle(); f.port.onMessage.emit(f.frame)
    const route = await c.ready; f.port.onDisconnect.emit(); expect(route.signal.aborted).toBe(true)
    expect(() => route.assertCurrent()).toThrow(); expect(f.port.disconnect).toHaveBeenCalledOnce()
  })
  it('cannot reuse a route when its own document becomes current again', async () => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); await settle(); f.port.onMessage.emit(f.frame); const route = await c.ready
    f.options.assertDocument.mockImplementation(() => { throw new Error('gone') }); expect(() => route.assertCurrent()).toThrow()
    f.options.assertDocument.mockImplementation(() => {}); expect(() => route.assertCurrent()).toThrow()
  })
  it('retires a ready route on another unexpected frame', async () => {
    const f = fixture(); const c = connectSharedUnlockBrowser(f.options); await settle(); f.port.onMessage.emit(f.frame); await c.ready
    f.port.onMessage.emit(f.frame); expect(c.signal.aborted).toBe(true)
  })
  it('cleans up a failed native call without leaking its error', async () => {
    const f = fixture(); vi.mocked(f.options.runtime.connect).mockImplementation(() => { throw new Error('synthetic internal value') })
    const c = connectSharedUnlockBrowser(f.options); await expect(c.ready).rejects.toThrow('Shared unlock browser channel unavailable')
  })
})
