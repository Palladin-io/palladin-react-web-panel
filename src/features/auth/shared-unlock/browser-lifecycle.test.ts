import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { startSharedUnlockBrowserLifecycle } from './browser-lifecycle'
import type { SharedUnlockNativeRuntime } from './browser-channel'
vi.mock('../../../shared/crypto/sodium', () => ({ randomBytes: async () => new Uint8Array(32), wipe: (bytes: Uint8Array) => bytes.fill(0) }))
function event<T extends unknown[]>() {
  const callbacks = new Set<(...args: T) => void>()
  return { addListener: (cb: (...args: T) => void) => callbacks.add(cb), removeListener: (cb: (...args: T) => void) => callbacks.delete(cb),
    emit: (...args: T) => { for (const cb of [...callbacks]) cb(...args) } }
}
function fixture() {
  const owner = new EventTarget() as unknown as Window
  Object.assign(owner, { location: { origin: 'https://app.example.test' }, top: owner })
  const document = new EventTarget() as Document
  Object.assign(document, { visibilityState: 'visible' })
  const ports: ReturnType<typeof newPort>[] = []
  function newPort() { return { onMessage: event<[unknown]>(), onDisconnect: event<[]>(), postMessage: vi.fn(), disconnect: vi.fn() } }
  const runtime: SharedUnlockNativeRuntime = { connect: vi.fn(() => { const port = newPort(); ports.push(port); return port }) }
  const options = { window: owner, document, extensionId: 'a'.repeat(32), apiUrl: 'https://api.example.test', runtime: vi.fn(() => runtime as SharedUnlockNativeRuntime | undefined), retireDocument: vi.fn() }
  const accept = (index = ports.length - 1) => ports[index].onMessage.emit({ type: 'ready', protocol: 'palladin.shared-unlock.browser.v1',
    apiUrl: options.apiUrl, webOrigin: owner.location.origin, extensionId: options.extensionId, webNonce: 'A'.repeat(43),
    channelId: 'E'.repeat(43), documentBinding: `7/document/${'E'.repeat(43)}` })
  return { owner, document, runtime, options, ports, accept }
}
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
describe('document-owned shared unlock connection', () => {
  it('reconnects after peer loss while leaving own session untouched', async () => {
    const f = fixture(); const c = startSharedUnlockBrowserLifecycle(f.options); await settle(); f.accept(); await settle()
    const old = c.currentRoute()!; f.ports[0].onDisconnect.emit(); expect(old.signal.aborted).toBe(true)
    expect(c.currentRoute()).toBeNull(); expect(f.options.retireDocument).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000); expect(f.ports).toHaveLength(2); f.accept(); await settle(); expect(c.currentRoute()).not.toBeNull(); c.close()
  })
  it('retires on pagehide, stays stopped in BFCache and reconnects on pageshow with a new route', async () => {
    const f = fixture(); const c = startSharedUnlockBrowserLifecycle(f.options); await settle(); f.accept(); await settle(); const old = c.currentRoute()!
    f.owner.dispatchEvent(new Event('pagehide')); expect(old.signal.aborted).toBe(true); expect(f.options.retireDocument).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(60000); expect(f.ports).toHaveLength(1)
    f.owner.dispatchEvent(new Event('pageshow')); await settle(); f.accept(); await settle(); expect(c.currentRoute()).not.toBe(old)
    expect(() => old.assertCurrent()).toThrow(); c.close()
  })
  it('cancels a pending handshake at pagehide and rejects late ready', async () => {
    const f = fixture(); const c = startSharedUnlockBrowserLifecycle(f.options); await settle(); f.owner.dispatchEvent(new Event('pagehide'))
    f.accept(); await settle(); expect(c.currentRoute()).toBeNull(); c.close()
  })
  it('does not retry in background but repairs on visibility without activity', async () => {
    const f = fixture(); const c = startSharedUnlockBrowserLifecycle(f.options); await settle(); f.accept(); await settle()
    Object.assign(f.document, { visibilityState: 'hidden' }); f.ports[0].onDisconnect.emit(); await vi.advanceTimersByTimeAsync(60000); expect(f.ports).toHaveLength(1)
    Object.assign(f.document, { visibilityState: 'visible' }); f.document.dispatchEvent(new Event('visibilitychange')); await settle(); expect(f.ports).toHaveLength(2)
    expect(f.options.retireDocument).not.toHaveBeenCalled(); c.close()
  })
  it('bounds retries for unavailable runtime and recovers if it appears', async () => {
    const f = fixture(); f.options.runtime.mockReturnValue(undefined); const c = startSharedUnlockBrowserLifecycle(f.options)
    await vi.advanceTimersByTimeAsync(60000); expect(f.options.runtime.mock.calls.length).toBeLessThan(9)
    f.options.runtime.mockReturnValue(f.runtime); f.document.dispatchEvent(new Event('visibilitychange')); await settle(); expect(f.ports).toHaveLength(1); c.close()
  })
  it.each(['iframe', 'prerender'])('does not connect from %s', async kind => {
    const f = fixture(); if (kind === 'iframe') Object.assign(f.owner, { top: {} }); else Object.assign(f.document, { prerendering: true })
    const c = startSharedUnlockBrowserLifecycle(f.options); await settle(); expect(f.ports).toHaveLength(0); c.close()
  })
  it('effect teardown removes listeners and timers without expiring own keys', async () => {
    const f = fixture(); const c = startSharedUnlockBrowserLifecycle(f.options); await settle(); c.close(); c.close()
    f.owner.dispatchEvent(new Event('pageshow')); f.owner.dispatchEvent(new Event('pagehide')); f.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60000); expect(f.ports).toHaveLength(1); expect(f.options.retireDocument).not.toHaveBeenCalled()
  })
})
